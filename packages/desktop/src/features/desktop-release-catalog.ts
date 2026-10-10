import { z } from "zod";
import type { AppReleaseChannel } from "./app-update-rollout.js";

// Reader side of the desktop release catalog (contract: desktop-release-catalog, written by
// scripts/desktop-release). Only the fields the updater needs are validated; additive fields
// are ignored so the publisher can grow the catalog without breaking shipped apps.

export const DESKTOP_RELEASE_BUCKET = "zekoder-releases";
export const DESKTOP_RELEASE_ORIGIN = "https://storage.googleapis.com";
export const DESKTOP_RELEASE_PREFIX = `/${DESKTOP_RELEASE_BUCKET}/desktop/releases/`;
export const DESKTOP_RELEASE_CATALOG_URL = `${DESKTOP_RELEASE_ORIGIN}${DESKTOP_RELEASE_PREFIX}manifest.json`;

const STABLE_TAG = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const BETA_TAG = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-beta\.(0|[1-9][0-9]*)$/;

export type DesktopUpdaterChannel = "latest" | "beta";

export interface DesktopFeedSelection {
  tag: string;
  version: string;
  channel: AppReleaseChannel;
  feedUrl: string;
  /** Electron-updater channel file prefix: latest[-mac|-linux].yml or beta[-mac|-linux].yml. */
  updaterChannel: DesktopUpdaterChannel;
  releaseNotesUrl: string | null;
}

export class DesktopReleaseCatalogError extends Error {
  constructor(message: string) {
    super(`Invalid desktop release catalog: ${message}`);
    this.name = "DesktopReleaseCatalogError";
  }
}

const targetSchema = z.object({
  platform: z.string(),
  arch: z.string(),
  feedUrl: z.string(),
});

const releaseSchema = z.object({
  tag: z.string(),
  version: z.string(),
  channel: z.string(),
  releaseNotesUrl: z.string().optional(),
  targets: z.array(targetSchema),
});

const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  channels: z.object({
    stable: z.string().nullable(),
    beta: z.string().nullable(),
  }),
  releases: z.record(z.string(), releaseSchema),
});

type Catalog = z.infer<typeof catalogSchema>;
type CatalogRelease = z.infer<typeof releaseSchema>;

function tagChannel(tag: string): AppReleaseChannel | null {
  if (STABLE_TAG.test(tag)) return "stable";
  if (BETA_TAG.test(tag)) return "beta";
  return null;
}

// Accepts only https URLs on the public desktop prefix; the returned URL is the parsed form.
function parseDesktopUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DesktopReleaseCatalogError(`${label} is not a URL`);
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== DESKTOP_RELEASE_ORIGIN ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new DesktopReleaseCatalogError(
      `${label} must be a plain https URL on ${DESKTOP_RELEASE_ORIGIN}`,
    );
  }
  if (!url.pathname.startsWith(DESKTOP_RELEASE_PREFIX)) {
    throw new DesktopReleaseCatalogError(`${label} must be inside ${DESKTOP_RELEASE_PREFIX}`);
  }
  return url;
}

function validateRelease(
  tag: string,
  tagReleaseChannel: AppReleaseChannel,
  release: CatalogRelease,
): void {
  if (release.tag !== tag)
    throw new DesktopReleaseCatalogError(`release ${tag} has tag ${release.tag}`);
  if (release.version !== tag.slice(1)) {
    throw new DesktopReleaseCatalogError(`release ${tag} has version ${release.version}`);
  }
  if (release.channel !== tagReleaseChannel) {
    throw new DesktopReleaseCatalogError(`release ${tag} has channel ${release.channel}`);
  }
}

export function parseDesktopReleaseCatalog(input: unknown): Catalog {
  const parsed = catalogSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new DesktopReleaseCatalogError(`${where}${issue?.message ?? "schema mismatch"}`);
  }
  return parsed.data;
}

/**
 * Picks the immutable feed for this OS/architecture from the channel pointer. Returns null when
 * the channel has no pointer or the release has no target for this machine (nothing to offer);
 * throws DesktopReleaseCatalogError for anything that is malformed or points off the desktop prefix.
 */
export function selectDesktopFeed(input: {
  catalog: unknown;
  releaseChannel: AppReleaseChannel;
  platform: string;
  arch: string;
}): DesktopFeedSelection | null {
  const catalog = parseDesktopReleaseCatalog(input.catalog);
  const tag = catalog.channels[input.releaseChannel];
  if (tag === null) return null;

  const tagReleaseChannel = tagChannel(tag);
  if (tagReleaseChannel === null) {
    throw new DesktopReleaseCatalogError(`pointer ${tag} has an unsupported tag`);
  }
  // The stable pointer only ever selects final releases; beta may also select a final release
  // so beta users receive the stable that supersedes their series.
  if (input.releaseChannel === "stable" && tagReleaseChannel !== "stable") {
    throw new DesktopReleaseCatalogError(`stable pointer ${tag} is not a stable release`);
  }
  const release = catalog.releases[tag];
  if (!release) throw new DesktopReleaseCatalogError(`pointer ${tag} has no release entry`);
  validateRelease(tag, tagReleaseChannel, release);

  const target = release.targets.find(
    (candidate) => candidate.platform === input.platform && candidate.arch === input.arch,
  );
  if (!target) return null;

  const feedUrl = parseDesktopUrl(target.feedUrl, `${tag} ${input.platform}/${input.arch} feedUrl`);
  const expectedPath = `${DESKTOP_RELEASE_PREFIX}${tag}/${input.platform}/${input.arch}/`;
  if (feedUrl.pathname !== expectedPath) {
    throw new DesktopReleaseCatalogError(`${tag} feedUrl must be ${expectedPath}`);
  }
  let releaseNotesUrl: string | null = null;
  if (release.releaseNotesUrl !== undefined) {
    const notes = parseDesktopUrl(release.releaseNotesUrl, `${tag} releaseNotesUrl`);
    if (!notes.pathname.startsWith(`${DESKTOP_RELEASE_PREFIX}${tag}/`)) {
      throw new DesktopReleaseCatalogError(`${tag} releaseNotesUrl must be inside its release`);
    }
    releaseNotesUrl = notes.href;
  }

  return {
    tag,
    version: release.version,
    channel: input.releaseChannel,
    feedUrl: feedUrl.href,
    updaterChannel: input.releaseChannel === "stable" ? "latest" : "beta",
    releaseNotesUrl,
  };
}

/** Port for reading the catalog; null means the catalog object is not published yet. */
export interface DesktopCatalogTransport {
  fetchCatalog(url: string): Promise<unknown | null>;
}

export async function resolveDesktopFeed(deps: {
  transport: DesktopCatalogTransport;
  releaseChannel: AppReleaseChannel;
  platform: string;
  arch: string;
}): Promise<DesktopFeedSelection | null> {
  const catalog = await deps.transport.fetchCatalog(DESKTOP_RELEASE_CATALOG_URL);
  if (catalog === null) return null;
  return selectDesktopFeed({
    catalog,
    releaseChannel: deps.releaseChannel,
    platform: deps.platform,
    arch: deps.arch,
  });
}

const CATALOG_FETCH_TIMEOUT_MS = 15_000;

/** Production transport: a 404 means unpublished, every other failure is an error. */
export function createHttpCatalogTransport(
  fetchImpl: typeof fetch = fetch,
): DesktopCatalogTransport {
  return {
    async fetchCatalog(url) {
      const response = await fetchImpl(url, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS),
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`Desktop release catalog request failed with HTTP ${response.status}`);
      }
      try {
        return (await response.json()) as unknown;
      } catch {
        throw new DesktopReleaseCatalogError("response is not JSON");
      }
    },
  };
}
