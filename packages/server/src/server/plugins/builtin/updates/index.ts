import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Logger } from "pino";
import semver from "semver";
import { extract as extractTar } from "tar";
import { z } from "zod";
import { writeJsonFileAtomic } from "../../../atomic-file.js";
import {
  isCompatibleWithDaemon,
  parseEnvelope,
  parsePayload,
  selectCandidate,
  verifyEnvelope,
  type ManifestRelease,
} from "./manifest.js";
import { computeTreeChecksum } from "./tree-checksum.js";
import type { TrustedKey } from "./trusted-keys.js";
import type {
  BuiltinPluginUpdateChannel,
  BuiltinPluginUpdateError,
  BuiltinPluginUpdateErrorCode,
  BuiltinPluginUpdateFallbackReason,
  BuiltinPluginUpdateStatus,
} from "./types.js";

export type {
  BuiltinPluginUpdateChannel,
  BuiltinPluginUpdateError,
  BuiltinPluginUpdateErrorCode,
  BuiltinPluginUpdateFallbackReason,
  BuiltinPluginUpdateStatus,
} from "./types.js";
export type { TrustedKey } from "./trusted-keys.js";

const UPDATES_DIR = "builtin-plugin-updates";
const CHANNEL_FILE = "desktop-channel.json";
const MANIFEST_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
const FIRST_CHECK_DELAY_MS = 60_000;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60_000;
const KEEP_INSTALLED = 3;
const MAX_START_FAILURES = 2;
const ARCHIVE_ROOT = "zekoder";

export interface BuiltinPluginUpdaterOptions {
  pluginId: string;
  paseoHome: string;
  bundledVersion: string;
  daemonVersion: string;
  manifestUrl: string;
  trustedKeys: readonly TrustedKey[];
  logger: Logger;
  fetch?: typeof fetch;
  now?: () => Date;
  intervalMs?: number;
}

export type ActiveBuiltinPluginUpdate =
  | { directory: string; version: string }
  | { fallbackReason: BuiltinPluginUpdateFallbackReason };

const stateSchema = z.object({
  schemaVersion: z.literal(1),
  installed: z.array(z.string()),
  failed: z.array(z.string()),
  startFailures: z.record(z.string(), z.number()),
  revoked: z.array(z.string()),
  lastCheckAt: z.string().nullable(),
  lastError: z
    .object({ code: z.string(), message: z.string(), at: z.string() })
    .nullable() as z.ZodType<BuiltinPluginUpdateError | null>,
  latestAvailable: z.string().nullable(),
  highestSequence: z.number().nullable(),
  // Additive to the contract's state shape: the `requires.paseo` range each installed version
  // declared, so resolveActive can re-check compatibility after a daemon change or restart.
  compat: z.record(z.string(), z.string()).optional(),
});

type UpdateState = z.infer<typeof stateSchema>;

function emptyState(): UpdateState {
  return {
    schemaVersion: 1,
    installed: [],
    failed: [],
    startFailures: {},
    revoked: [],
    lastCheckAt: null,
    lastError: null,
    latestAvailable: null,
    highestSequence: null,
  };
}

class CheckFailure extends Error {
  constructor(
    readonly code: BuiltinPluginUpdateErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readChannelFile(file: string): BuiltinPluginUpdateChannel {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as { channel?: unknown }).channel === "beta"
    )
      return "beta";
  } catch {
    // Missing or invalid means stable.
  }
  return "stable";
}

/** Rejects absolute paths, `..` segments, backslashes and anything outside the `zekoder/` root. */
function unsafeArchivePath(entryPath: string): string | null {
  if (entryPath.includes("\\") || path.posix.isAbsolute(entryPath) || path.isAbsolute(entryPath)) {
    return "absolute or backslash path";
  }
  const segments = entryPath.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.includes("..")) return "path traversal";
  if (segments[0] !== ARCHIVE_ROOT) return `entry outside ${ARCHIVE_ROOT}/`;
  return null;
}

export class BuiltinPluginUpdater {
  readonly pluginId: string;
  readonly bundledVersion: string;
  private readonly pluginDir: string;
  private readonly stateFile: string;
  private readonly channelFile: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly intervalMs: number;
  private readonly logger: Logger;

  private state: UpdateState | null = null;
  private stateLoad: Promise<void> | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private checking: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private started = false;
  private lastCheckChannel: BuiltinPluginUpdateChannel | null = null;
  private candidateVersion: string | null = null;
  private running: {
    source: "bundled" | "downloaded";
    version: string;
    fallbackReason: BuiltinPluginUpdateFallbackReason | null;
  } | null = null;

  constructor(private readonly options: BuiltinPluginUpdaterOptions) {
    this.pluginId = options.pluginId;
    this.bundledVersion = options.bundledVersion;
    const root = path.join(options.paseoHome, UPDATES_DIR);
    this.pluginDir = path.join(root, options.pluginId);
    this.stateFile = path.join(this.pluginDir, "state.json");
    this.channelFile = path.join(root, CHANNEL_FILE);
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.logger = options.logger.child({ module: "builtin-plugin-updater", plugin: this.pluginId });
  }

  private get enabled(): boolean {
    return this.options.trustedKeys.length > 0;
  }

  start(): void {
    if (!this.enabled || this.started) return;
    this.started = true;
    this.schedule(FIRST_CHECK_DELAY_MS);
  }

  stop(): void {
    this.started = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delayMs: number): void {
    this.timer = setTimeout(() => {
      void this.checkNow().finally(() => {
        if (this.started) this.schedule(this.intervalMs);
      });
    }, delayMs);
    this.timer.unref();
  }

  async checkNow(): Promise<void> {
    if (!this.enabled) return;
    this.checking ??= this.runCheck().finally(() => {
      this.checking = null;
    });
    await this.checking;
  }

  getStatus(): BuiltinPluginUpdateStatus {
    const state = this.state ?? emptyState();
    const runningVersion = this.running?.version ?? this.options.bundledVersion;
    const stagedVersion =
      this.candidateVersion !== null && this.candidateVersion !== runningVersion
        ? this.candidateVersion
        : null;
    return {
      pluginId: this.pluginId,
      runningVersion,
      source: this.running?.source ?? "bundled",
      stagedVersion,
      restartRequired: stagedVersion !== null,
      fallbackReason: this.running?.fallbackReason ?? null,
      lastCheckAt: state.lastCheckAt,
      lastError: state.lastError,
      bundledVersion: this.options.bundledVersion,
      latestAvailable: state.latestAvailable,
      channel: this.lastCheckChannel ?? readChannelFile(this.channelFile),
      enabled: this.enabled,
    };
  }

  recordRunning(input: {
    source: "bundled" | "downloaded";
    version: string;
    fallbackReason: BuiltinPluginUpdateFallbackReason | null;
  }): void {
    this.running = input;
  }

  async resolveActive(): Promise<ActiveBuiltinPluginUpdate | null> {
    const state = await this.loadState();
    return this.refreshCandidate(state);
  }

  async recordStartFailure(version: string, message: string): Promise<void> {
    await this.mutate((state) => {
      const failures = (state.startFailures[version] ?? 0) + 1;
      state.startFailures[version] = failures;
      if (failures >= MAX_START_FAILURES && !state.failed.includes(version)) {
        state.failed.push(version);
      }
      state.lastError = { code: "start-failed", message, at: this.now().toISOString() };
    });
  }

  private refreshCandidate(state: UpdateState): ActiveBuiltinPluginUpdate | null {
    const active = this.computeActive(state);
    this.candidateVersion = active && "version" in active ? active.version : this.bundled;
    return active;
  }

  private get bundled(): string {
    return this.options.bundledVersion;
  }

  /** Best installed copy, or the reason the best excluded one is not used. Sync: reads only cached state. */
  private computeActive(state: UpdateState): ActiveBuiltinPluginUpdate | null {
    const installed = state.installed
      .filter((version) => semver.valid(version) && semver.gt(version, this.bundled))
      .filter((version) => existsSync(path.join(this.pluginDir, version)))
      .sort(semver.rcompare);
    let firstExcluded: BuiltinPluginUpdateFallbackReason | null = null;
    for (const version of installed) {
      let reason: BuiltinPluginUpdateFallbackReason | null = null;
      if (state.revoked.includes(version)) reason = "revoked";
      else if (state.failed.includes(version)) reason = "previously-failed";
      else if (!this.isCompatible(state, version)) reason = "incompatible";
      if (reason === null) return { directory: path.join(this.pluginDir, version), version };
      firstExcluded ??= reason;
    }
    return firstExcluded === null ? null : { fallbackReason: firstExcluded };
  }

  private isCompatible(state: UpdateState, version: string): boolean {
    const range = state.compat?.[version];
    return range === undefined || isCompatibleWithDaemon(range, this.options.daemonVersion);
  }

  // --- state ---------------------------------------------------------------------------------

  private async loadState(): Promise<UpdateState> {
    this.stateLoad ??= (async () => {
      let state = emptyState();
      try {
        state = stateSchema.parse(JSON.parse(await readFile(this.stateFile, "utf8")));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          this.logger.warn({ err: error }, "Ignoring unreadable plugin update state");
        }
      }
      this.state ??= state;
    })();
    await this.stateLoad;
    return this.state ?? emptyState();
  }

  /** Serialised load-modify-write so concurrent callers never lose an update. */
  private mutate(change: (state: UpdateState) => void): Promise<void> {
    const run = async (): Promise<void> => {
      const state = await this.loadState();
      const next = structuredClone(state);
      change(next);
      await writeJsonFileAtomic(this.stateFile, next);
      this.state = next;
      this.refreshCandidate(next);
    };
    const result = this.writeQueue.then(run, run);
    this.writeQueue = result.catch(() => undefined);
    return result;
  }

  // --- check ---------------------------------------------------------------------------------

  private async runCheck(): Promise<void> {
    try {
      const channel = readChannelFile(this.channelFile);
      this.lastCheckChannel = channel;
      await this.loadState();
      try {
        await this.check(channel);
      } catch (error) {
        const failure =
          error instanceof CheckFailure
            ? error
            : new CheckFailure("unpack-failed", errorMessage(error), { cause: error });
        this.logger.warn({ err: failure, code: failure.code }, "Plugin update check failed");
        await this.mutate((state) => {
          const at = this.now().toISOString();
          state.lastCheckAt = at;
          state.lastError = { code: failure.code, message: failure.message, at };
        });
      }
    } catch (error) {
      this.logger.error({ err: error }, "Plugin update check could not record its result");
    }
  }

  private async check(channel: BuiltinPluginUpdateChannel): Promise<void> {
    const payload = await this.fetchManifest();
    const state = await this.loadState();

    if (state.highestSequence !== null && payload.sequence < state.highestSequence) {
      throw new CheckFailure(
        "sequence-replay",
        `Manifest sequence ${payload.sequence} is lower than ${state.highestSequence}`,
      );
    }

    const selection = selectCandidate({
      payload,
      channel,
      bundledVersion: this.bundled,
      installed: state.installed,
      failed: state.failed,
      daemonVersion: this.options.daemonVersion,
    });
    await this.mutate((next) => {
      next.lastCheckAt = this.now().toISOString();
      if (next.highestSequence === null || payload.sequence > next.highestSequence) {
        next.highestSequence = payload.sequence;
        next.revoked = payload.revoked.map((entry) => entry.version);
      }
      next.latestAvailable = selection.latestAvailable;
    });

    if (selection.candidate === null) {
      const excluded = selection.incompatible;
      await this.mutate((next) => {
        next.lastError = excluded
          ? {
              code: "incompatible",
              message: `Zekoder plugin ${excluded.version} requires Paseo ${excluded.requires.paseo}, daemon is ${this.options.daemonVersion}`,
              at: this.now().toISOString(),
            }
          : null;
      });
      return;
    }

    await this.install(selection.candidate);
    await this.mutate((next) => {
      next.lastError = null;
    });
  }

  private async fetchManifest() {
    let text: string;
    try {
      const response = await this.fetchImpl(this.options.manifestUrl, {
        redirect: "error",
        signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      text = await response.text();
    } catch (cause) {
      throw new CheckFailure(
        "manifest-fetch-failed",
        `Could not fetch the plugin manifest: ${errorMessage(cause)}`,
        { cause },
      );
    }

    let envelope;
    try {
      envelope = parseEnvelope(JSON.parse(text));
    } catch (cause) {
      throw new CheckFailure(
        "manifest-invalid",
        `Invalid manifest envelope: ${errorMessage(cause)}`,
        {
          cause,
        },
      );
    }

    const verified = verifyEnvelope(envelope, this.options.trustedKeys);
    if (!verified) {
      throw new CheckFailure("signature-invalid", "No trusted signature verified the manifest");
    }

    try {
      return parsePayload(verified, this.pluginId);
    } catch (cause) {
      throw new CheckFailure(
        "manifest-invalid",
        `Invalid manifest payload: ${errorMessage(cause)}`,
        {
          cause,
        },
      );
    }
  }

  private async download(release: ManifestRelease): Promise<Buffer> {
    const { url, size, sha256 } = release.artifact;
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      const response = await this.fetchImpl(url, {
        redirect: "error",
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > size) {
          await reader.cancel().catch(() => undefined);
          break;
        }
        chunks.push(Buffer.from(value));
      }
    } catch (cause) {
      throw new CheckFailure(
        "download-failed",
        `Could not download ${url}: ${errorMessage(cause)}`,
        {
          cause,
        },
      );
    }
    if (total !== size) {
      throw new CheckFailure(
        "size-mismatch",
        `Artifact size ${total > size ? `exceeds ${size}` : total} does not match manifest size ${size}`,
      );
    }
    const bytes = Buffer.concat(chunks);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== sha256.toLowerCase()) {
      throw new CheckFailure("sha256-mismatch", "Artifact sha256 does not match the manifest");
    }
    return bytes;
  }

  private async unpack(bytes: Buffer, staging: string): Promise<string> {
    let violation: string | null = null;
    try {
      await mkdir(staging, { recursive: true });
      await pipeline(
        Readable.from([bytes]),
        extractTar({
          cwd: staging,
          strict: true,
          filter: (entryPath, entry) => {
            const type = "type" in entry ? entry.type : undefined;
            const unsafe =
              type !== "File" && type !== "Directory"
                ? `unsupported entry type ${String(type)}`
                : unsafeArchivePath(entryPath);
            if (unsafe) {
              violation ??= `${entryPath}: ${unsafe}`;
              return false;
            }
            return true;
          },
        }),
      );
    } catch (cause) {
      throw new CheckFailure(
        "unpack-failed",
        `Could not unpack the artifact: ${errorMessage(cause)}`,
        {
          cause,
        },
      );
    }
    if (violation) {
      throw new CheckFailure("unpack-failed", `Unsafe artifact entry ${violation}`);
    }
    const entries = await readdir(staging);
    const unpacked = path.join(staging, ARCHIVE_ROOT);
    if (entries.length !== 1 || entries[0] !== ARCHIVE_ROOT) {
      throw new CheckFailure(
        "unpack-failed",
        `Artifact must contain a single ${ARCHIVE_ROOT}/ root`,
      );
    }
    try {
      const manifest: unknown = JSON.parse(
        await readFile(path.join(unpacked, "paseo-plugin.json"), "utf8"),
      );
      if ((manifest as { id?: unknown } | null)?.id !== this.pluginId) {
        throw new Error(`paseo-plugin.json id is not ${this.pluginId}`);
      }
    } catch (cause) {
      throw new CheckFailure("unpack-failed", `Invalid paseo-plugin.json: ${errorMessage(cause)}`, {
        cause,
      });
    }
    return unpacked;
  }

  private async install(release: ManifestRelease): Promise<void> {
    const { version } = release;
    const bytes = await this.download(release);
    const staging = path.join(this.pluginDir, `${version}.staging-${randomUUID()}`);
    try {
      const unpacked = await this.unpack(bytes, staging);
      if (computeTreeChecksum(unpacked) !== release.treeChecksum) {
        throw new CheckFailure(
          "tree-checksum-mismatch",
          "Unpacked plugin does not match the manifest tree checksum",
        );
      }
      const target = path.join(this.pluginDir, version);
      await rm(target, { recursive: true, force: true });
      await rename(unpacked, target);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
    await this.mutate((state) => {
      if (!state.installed.includes(version)) state.installed.push(version);
      state.compat = { ...state.compat, [version]: release.requires.paseo };
    });
    await this.prune();
  }

  private async prune(): Promise<void> {
    const state = await this.loadState();
    const keep = new Set([...state.installed].sort(semver.rcompare).slice(0, KEEP_INSTALLED));
    if (this.running?.source === "downloaded") keep.add(this.running.version);
    const removed = state.installed.filter((version) => !keep.has(version));
    for (const version of removed) {
      await rm(path.join(this.pluginDir, version), { recursive: true, force: true });
    }
    for (const entry of await readdir(this.pluginDir)) {
      if (entry.includes(".staging-")) {
        await rm(path.join(this.pluginDir, entry), { recursive: true, force: true });
      }
    }
    if (removed.length > 0) {
      await this.mutate((next) => {
        next.installed = next.installed.filter((version) => !removed.includes(version));
        for (const version of removed) delete next.compat?.[version];
      });
    }
  }
}
