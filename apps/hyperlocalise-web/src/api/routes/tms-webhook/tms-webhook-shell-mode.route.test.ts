import "dotenv/config";

import { describe, expect, it, vi } from "vitest";

import { createApp } from "@/api/app";

vi.mock("@/lib/providers/tms-provider-shell-mode", () => ({
  isTmsProviderShellModeEnabled: () => true,
  isTmsBackgroundSyncEnabled: () => false,
  TMS_PROVIDER_SHELL_BACKGROUND_SYNC_DISABLED_REASON: "tms_provider_shell_mode",
}));

describe("tmsWebhookRoutes shell mode", () => {
  it("accepts inbound webhooks without enqueueing sync work", async () => {
    const app = createApp();
    const response = await app.request("/api/webhooks/tms/crowdin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "project.synced", project: { id: 1 } }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      ignored: true,
      reason: "tms_provider_shell_mode",
    });
  });
});
