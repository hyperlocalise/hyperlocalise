import { afterEach, describe, expect, it, vi } from "vitest";

describe("tms-provider-shell-mode", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("defaults shell mode to disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_TMS_PROVIDER_SHELL_MODE", undefined);
    vi.stubEnv("TMS_PROVIDER_SHELL_MODE", undefined);

    const { isTmsProviderShellModeEnabled, isTmsBackgroundSyncEnabled } = await import(
      "./tms-provider-shell-mode"
    );

    expect(isTmsProviderShellModeEnabled()).toBe(false);
    expect(isTmsBackgroundSyncEnabled()).toBe(true);
  });

  it("enables shell mode from NEXT_PUBLIC_TMS_PROVIDER_SHELL_MODE", async () => {
    vi.stubEnv("NEXT_PUBLIC_TMS_PROVIDER_SHELL_MODE", "true");
    vi.stubEnv("TMS_PROVIDER_SHELL_MODE", undefined);

    const { isTmsProviderShellModeEnabled, isTmsBackgroundSyncEnabled } = await import(
      "./tms-provider-shell-mode"
    );

    expect(isTmsProviderShellModeEnabled()).toBe(true);
    expect(isTmsBackgroundSyncEnabled()).toBe(false);
  });

  it("falls back to TMS_PROVIDER_SHELL_MODE when NEXT_PUBLIC is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_TMS_PROVIDER_SHELL_MODE", undefined);
    vi.stubEnv("TMS_PROVIDER_SHELL_MODE", "true");

    const { isTmsProviderShellModeEnabled } = await import("./tms-provider-shell-mode");

    expect(isTmsProviderShellModeEnabled()).toBe(true);
  });
});
