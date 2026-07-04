import "dotenv/config";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { createApp } from "@/api/app";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import {
  cleanupCanvaOAuthTestSessions,
  createCanvaOAuthTestSession,
} from "@/api/routes/canva-integration/canva-oauth.fixture";

const app = createApp();
const projectFixture = createProjectTestFixture();

describe("canvaOAuthRoutes", () => {
  const cleanedUserIds: string[] = [];

  afterEach(async () => {
    await cleanupCanvaOAuthTestSessions(cleanedUserIds);
    cleanedUserIds.length = 0;
    await projectFixture.cleanup();
  });

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

  it("rejects refresh token reuse after rotation", async () => {
    const { user } = await projectFixture.createLocalWorkosIdentity();
    const oauth = await createCanvaOAuthTestSession({
      userId: user.id,
    });
    cleanedUserIds.push(user.id);

    const refreshBody = {
      grant_type: "refresh_token",
      refresh_token: oauth.refreshToken,
      client_id: "test-canva-oauth-client",
      client_secret: "test-canva-oauth-client-secret",
    };

    const firstResponse = await app.request("/api/oauth/canva/token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(refreshBody),
    });

    expect(firstResponse.status).toBe(200);

    const replayResponse = await app.request("/api/oauth/canva/token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(refreshBody),
    });

    expect(replayResponse.status).toBe(400);
    await expect(replayResponse.json()).resolves.toEqual({ error: "invalid_grant" });
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
