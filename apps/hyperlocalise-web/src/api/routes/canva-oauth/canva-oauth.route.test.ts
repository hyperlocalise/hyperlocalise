import "dotenv/config";

import { describe, expect, it } from "vite-plus/test";

import { createApp } from "@/api/app";

const app = createApp();

describe("canvaOAuthRoutes", () => {
  it("rejects token requests without caller-supplied client credentials", async () => {
    const response = await app.request("/api/oauth/canva/token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: "hl_canva_refresh",
        client_id: "test-canva-oauth-client",
      }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid_client" });
  });

  it("rejects revoke requests without caller-supplied client credentials", async () => {
    const response = await app.request("/api/oauth/canva/revoke", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        token: "hl_canva_token",
        client_id: "test-canva-oauth-client",
      }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid_client" });
  });
});
