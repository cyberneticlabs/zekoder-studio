import { describe, expect, it } from "vitest";
import {
  ZEKODER_PLUGIN_SOURCE,
  ZEKODER_PLUGIN_VERSION,
  resolveHostZekoderStatus,
  resolveZekoderActiveHost,
  shouldShowZekoderPlaceholders,
  type HostZekoderStatusInput,
} from "./host-provisioning";

function input(overrides: Partial<HostZekoderStatusInput> = {}): HostZekoderStatusInput {
  return {
    connected: true,
    pluginsSupported: true,
    sourceInstallSupported: true,
    catalogPluginIds: [],
    installed: [],
    pluginsEnabled: true,
    ...overrides,
  };
}

describe("resolveHostZekoderStatus", () => {
  it("is unknown while offline, unsupported by feature, or loading", () => {
    expect(resolveHostZekoderStatus(input({ connected: false }))).toBe("unknown");
    expect(resolveHostZekoderStatus(input({ pluginsSupported: false }))).toBe("unknown");
    expect(resolveHostZekoderStatus(input({ catalogPluginIds: null }))).toBe("unknown");
    expect(resolveHostZekoderStatus(input({ installed: null }))).toBe("unknown");
  });

  it("is present when the catalog has zekoder", () => {
    expect(resolveHostZekoderStatus(input({ catalogPluginIds: ["zekoder"] }))).toBe("present");
  });

  it("is unsupported without source installation", () => {
    expect(resolveHostZekoderStatus(input({ sourceInstallSupported: false }))).toBe("unsupported");
  });

  it("asks to install when zekoder is not configured", () => {
    expect(resolveHostZekoderStatus(input())).toBe("install");
  });

  it("asks to enable a configured but disabled plugin", () => {
    const installed = [{ id: "zekoder", enabled: false, status: "disabled" }];
    expect(resolveHostZekoderStatus(input({ installed }))).toBe("enable-plugin");
  });

  it("asks to enable plugins when zekoder is enabled but plugins are off", () => {
    const installed = [{ id: "zekoder", enabled: true, status: "disabled" }];
    expect(resolveHostZekoderStatus(input({ installed, pluginsEnabled: false }))).toBe(
      "enable-plugins",
    );
  });

  it("reports failed only with an error", () => {
    const failed = { id: "zekoder", enabled: true, status: "failed" };
    expect(resolveHostZekoderStatus(input({ installed: [{ ...failed, error: "boom" }] }))).toBe(
      "failed",
    );
    expect(resolveHostZekoderStatus(input({ installed: [failed] }))).toBe("unknown");
  });
});

describe("resolveZekoderActiveHost", () => {
  it("prefers the route host over the workspace host", () => {
    expect(resolveZekoderActiveHost("a", "b")).toBe("a");
    expect(resolveZekoderActiveHost(null, "b")).toBe("b");
    expect(resolveZekoderActiveHost(null, null)).toBeNull();
  });
});

describe("shouldShowZekoderPlaceholders", () => {
  it("shows only without a contributed group and with an actionable status", () => {
    expect(shouldShowZekoderPlaceholders(false, "install")).toBe(true);
    expect(shouldShowZekoderPlaceholders(false, "unsupported")).toBe(true);
    expect(shouldShowZekoderPlaceholders(false, "failed")).toBe(true);
    expect(shouldShowZekoderPlaceholders(false, "present")).toBe(false);
    expect(shouldShowZekoderPlaceholders(false, "unknown")).toBe(false);
    expect(shouldShowZekoderPlaceholders(true, "install")).toBe(false);
  });
});

describe("the pinned plugin version", () => {
  it("is exact semver and names the npm package", () => {
    expect(ZEKODER_PLUGIN_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(ZEKODER_PLUGIN_SOURCE).toBe(
      `npm:@cyberneticlabs/paseo-zekoder@${ZEKODER_PLUGIN_VERSION}`,
    );
  });
});
