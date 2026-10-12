/**
 * @vitest-environment jsdom
 */
import { i18n as testI18n } from "@/i18n/i18next";
import React, { type ReactElement } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHostZekoder, type HostZekoder } from "./use-host-zekoder";

void testI18n;

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  confirm: vi.fn(async (_input: unknown) => true),
  patchConfig: vi.fn(async (_patch: unknown) => undefined),
  toastError: vi.fn(),
  pluginsEnabled: false,
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => mocks.client,
  useHostRuntimeIsConnected: () => true,
}));
vi.mock("@/runtime/host-features", () => ({ useHostFeature: () => true }));
vi.mock("@/hooks/use-daemon-config", () => ({
  useDaemonConfig: () => ({
    config: { pluginsEnabled: mocks.pluginsEnabled },
    isLoading: false,
    patchConfig: mocks.patchConfig,
  }),
}));
vi.mock("@/contexts/toast-context", () => ({
  useToast: () => ({ error: mocks.toastError, show: vi.fn(), copied: vi.fn() }),
}));
vi.mock("@/utils/confirm-dialog", () => ({
  confirmDialog: (input: unknown) => mocks.confirm(input),
}));
vi.mock("expo-router", () => ({ usePathname: () => "/" }));
vi.mock("@/stores/navigation-active-workspace-store", () => ({
  useActiveWorkspaceSelection: () => null,
}));

function createClient() {
  return {
    getPluginCatalog: vi.fn(async () => []),
    listPlugins: vi.fn(async () => []),
    installPluginSource: vi.fn(async () => ({})),
    enablePlugin: vi.fn(async () => ({})),
  };
}

let latest: HostZekoder | null = null;

function Probe() {
  latest = useHostZekoder("host-a");
  return null;
}

async function renderProbe(): Promise<HostZekoder> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const element: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>
  );
  render(element);
  await waitFor(() => expect(latest?.status).toBe("install"));
  return latest as unknown as HostZekoder;
}

describe("useHostZekoder", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    mocks.confirm.mockReset();
    mocks.confirm.mockResolvedValue(true);
    mocks.patchConfig.mockClear();
    mocks.toastError.mockClear();
    mocks.pluginsEnabled = false;
    mocks.client = createClient();
    latest = null;
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("makes no client calls when the consent is declined", async () => {
    mocks.confirm.mockResolvedValue(false);
    await renderProbe();
    await act(async () => {
      await latest?.provision();
    });
    const client = mocks.client as ReturnType<typeof createClient>;
    expect(client.installPluginSource).not.toHaveBeenCalled();
    expect(mocks.patchConfig).not.toHaveBeenCalled();
  });

  it("installs then turns plugins on after one confirmation", async () => {
    await renderProbe();
    await act(async () => {
      await latest?.provision();
    });
    const client = mocks.client as ReturnType<typeof createClient>;
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(client.installPluginSource).toHaveBeenCalledWith({
      source: "npm:@cyberneticlabs/paseo-zekoder@0.11.1",
      id: "zekoder",
    });
    expect(mocks.patchConfig).toHaveBeenCalledWith({ pluginsEnabled: true });
  });

  it("does not turn plugins on and toasts when the install fails", async () => {
    const client = createClient();
    client.installPluginSource.mockRejectedValue(new Error("404 not found"));
    mocks.client = client;
    await renderProbe();
    await act(async () => {
      await latest?.provision();
    });
    expect(mocks.patchConfig).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("404 not found"));
  });
});
