import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_DESKTOP_SETTINGS } from "../settings/desktop-settings";
import { createDaemonCommandHandlers } from "./daemon-manager";

const mocks = vi.hoisted(() => ({
  paseoHome: "",
  settings: {
    releaseChannel: "stable",
    daemon: {
      manageBuiltInDaemon: true,
      keepRunningAfterQuit: true,
    },
  },
  runExternalCliJsonCommand: vi.fn(),
  runExternalCliTextCommand: vi.fn(),
  createNodeEntrypointInvocation: vi.fn(() => ({
    command: "node",
    args: [],
    env: {},
  })),
  spawnProcess: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
  appLogPath: "",
  getElectronLogFile: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => mocks.paseoHome),
    getVersion: vi.fn(() => "1.2.3"),
    isPackaged: true,
  },
  ipcMain: { handle: vi.fn() },
  powerMonitor: { getSystemIdleTime: vi.fn(() => 0) },
}));

vi.mock("electron-log/main", () => ({
  default: {
    info: mocks.logInfo,
    error: mocks.logError,
    transports: {
      file: {
        getFile: mocks.getElectronLogFile,
      },
    },
  },
}));

vi.mock("@getpaseo/server/daemon-control", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolvePaseoHome: () => mocks.paseoHome,
  spawnProcess: mocks.spawnProcess,
}));

vi.mock("../settings/desktop-settings-electron.js", () => ({
  getDesktopSettingsStore: () => ({
    get: async () => mocks.settings,
    patch: async (patch: Record<string, unknown>) => {
      mocks.settings = { ...mocks.settings, ...patch };
      return mocks.settings;
    },
    migrateLegacyRendererSettings: vi.fn(),
  }),
}));

vi.mock("./runtime-paths.js", () => ({
  createNodeEntrypointInvocation: mocks.createNodeEntrypointInvocation,
  resolveDaemonRunnerEntrypoint: vi.fn(() => ({
    entryPath: path.join(mocks.paseoHome, "daemon.js"),
    execArgv: [],
  })),
}));

vi.mock("./cli/external.js", () => ({
  runExternalCliJsonCommand: mocks.runExternalCliJsonCommand,
  runExternalCliTextCommand: mocks.runExternalCliTextCommand,
}));

describe("daemon-manager commands", () => {
  let fixtureRoot: string;

  beforeEach(() => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), "paseo daemon manager "));
    mocks.paseoHome = path.join(fixtureRoot, "home");
    mocks.appLogPath = path.join(fixtureRoot, "main.log");
    mocks.settings = DEFAULT_DESKTOP_SETTINGS;
    mocks.runExternalCliJsonCommand.mockReset();
    mocks.runExternalCliTextCommand.mockReset();
    mocks.createNodeEntrypointInvocation.mockReset();
    mocks.createNodeEntrypointInvocation.mockReturnValue({ command: "node", args: [], env: {} });
    mocks.spawnProcess.mockReset();
    mocks.logInfo.mockReset();
    mocks.logError.mockReset();
    mocks.getElectronLogFile.mockReset();
    mocks.getElectronLogFile.mockReturnValue({ path: mocks.appLogPath });
  });

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("returns the Electron main-process log tail from electron-log", () => {
    writeFileSync(
      mocks.appLogPath,
      Array.from({ length: 105 }, (_value, index) => `main log line ${index + 1}`).join("\n"),
    );
    const handlers = createDaemonCommandHandlers();

    expect(handlers.desktop_app_logs()).toEqual({
      logPath: mocks.appLogPath,
      contents: Array.from({ length: 100 }, (_value, index) => `main log line ${index + 6}`).join(
        "\n",
      ),
    });
  });

  it("exposes updater diagnostics through the desktop command boundary", () => {
    const diagnostics = createDaemonCommandHandlers().desktop_update_diagnostics();

    expect(diagnostics).toMatchObject({
      platform: process.platform,
      currentVersion: "1.2.3",
    });
  });

  it("reports a stopped daemon without launching the CLI when no local daemon runs", async () => {
    mkdirSync(mocks.paseoHome);
    writeFileSync(path.join(mocks.paseoHome, "server-id"), "srv_existing\n");
    mocks.runExternalCliJsonCommand.mockResolvedValue({
      home: mocks.paseoHome,
      pid: null,
      startedAt: null,
      listen: null,
      hostname: null,
      localDaemon: "stopped",
      desktopManaged: false,
      connectedDaemon: "not_probed",
    });

    const status = await createDaemonCommandHandlers().desktop_daemon_status();

    expect(status).toMatchObject({ serverId: "", status: "stopped", pid: null });
    expect(mocks.runExternalCliJsonCommand).not.toHaveBeenCalled();
  });

  it("reports an errored daemon when the local daemon state cannot be read", async () => {
    mkdirSync(mocks.paseoHome);
    writeFileSync(path.join(mocks.paseoHome, "paseo.pid"), "garbage");

    const status = await createDaemonCommandHandlers().desktop_daemon_status();

    expect(status).toMatchObject({ serverId: "", status: "errored", pid: null });
    expect(status.error).toBeTruthy();
  });

  it("returns a local credential only for its live managed daemon listen", async () => {
    mkdirSync(mocks.paseoHome);
    const token = "a".repeat(43);
    writeFileSync(path.join(mocks.paseoHome, "local-credential"), `${token}\n`, { mode: 0o600 });
    const lock = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      hostname: hostname(),
      uid: process.getuid?.() ?? 0,
      listen: "127.0.0.1:6799",
      desktopManaged: true,
    };
    const lockPath = path.join(mocks.paseoHome, "paseo.pid");
    writeFileSync(lockPath, JSON.stringify(lock));
    const handler = createDaemonCommandHandlers().desktop_local_credential;
    expect(await handler({ listen: "localhost:6799" })).toBe(token);
    expect(await handler({ listen: "remote:6799" })).toBeNull();
    writeFileSync(lockPath, JSON.stringify({ ...lock, desktopManaged: false }));
    expect(await handler({ listen: "localhost:6799" })).toBeNull();
  });

  const channelFile = () =>
    path.join(mocks.paseoHome, "builtin-plugin-updates", "desktop-channel.json");

  it("writes the settings release channel for built-in plugin updates before reusing a running daemon", async () => {
    mocks.settings = { ...DEFAULT_DESKTOP_SETTINGS, releaseChannel: "beta" };
    mkdirSync(mocks.paseoHome);
    writeFileSync(
      path.join(mocks.paseoHome, "paseo.pid"),
      JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString(),
        hostname: hostname(),
        uid: process.getuid?.() ?? 0,
        listen: "127.0.0.1:6799",
        desktopManaged: true,
      }),
    );
    mocks.runExternalCliJsonCommand.mockResolvedValue({
      pid: process.pid,
      listen: "127.0.0.1:6799",
      hostname: hostname(),
      localDaemon: "running",
      desktopManaged: true,
      daemonVersion: "1.2.3",
    });

    const status = await createDaemonCommandHandlers().start_desktop_daemon();

    expect(status).toMatchObject({ status: "running" });
    expect(mocks.createNodeEntrypointInvocation).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(channelFile(), "utf8"))).toEqual({ channel: "beta" });
  });

  it("writes the built-in plugin update channel before spawning a fresh daemon", async () => {
    mocks.settings = { ...DEFAULT_DESKTOP_SETTINGS, releaseChannel: "stable" };
    mocks.createNodeEntrypointInvocation.mockImplementation(() => {
      throw new Error("launch blocked in test");
    });

    await expect(createDaemonCommandHandlers().start_desktop_daemon()).rejects.toThrow(
      "launch blocked in test",
    );

    expect(JSON.parse(readFileSync(channelFile(), "utf8"))).toEqual({ channel: "stable" });
    expect(existsSync(`${channelFile()}.${process.pid}.tmp`)).toBe(false);
  });

  it("writes the release channel immediately when the setting changes", async () => {
    const handlers = createDaemonCommandHandlers();

    await handlers.patch_desktop_settings({ releaseChannel: "beta" });
    expect(JSON.parse(readFileSync(channelFile(), "utf8"))).toEqual({ channel: "beta" });

    await handlers.patch_desktop_settings({ releaseChannel: "stable" });
    expect(JSON.parse(readFileSync(channelFile(), "utf8"))).toEqual({ channel: "stable" });
  });

  it("leaves the channel file alone when a patch does not touch the release channel", async () => {
    await createDaemonCommandHandlers().patch_desktop_settings({
      daemon: { keepRunningAfterQuit: false },
    });

    expect(existsSync(channelFile())).toBe(false);
  });

  it("rewrites a stale channel file when the daemon is restarted from settings", async () => {
    mocks.settings = { ...DEFAULT_DESKTOP_SETTINGS, releaseChannel: "beta" };
    mkdirSync(path.dirname(channelFile()), { recursive: true });
    writeFileSync(channelFile(), `${JSON.stringify({ channel: "stable" })}\n`);
    mocks.runExternalCliJsonCommand.mockResolvedValue({});

    await createDaemonCommandHandlers().restart_desktop_daemon();

    expect(mocks.runExternalCliJsonCommand).toHaveBeenCalledWith(
      expect.arrayContaining(["daemon", "restart"]),
    );
    expect(JSON.parse(readFileSync(channelFile(), "utf8"))).toEqual({ channel: "beta" });
  });
});
