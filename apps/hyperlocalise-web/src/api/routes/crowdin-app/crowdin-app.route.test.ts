import jwt from "jsonwebtoken";
import { describe, expect, it } from "vite-plus/test";
import { testClient } from "hono/testing";

import { app } from "@/api/app";
import { env } from "@/lib/env";

describe("crowdin app routes", () => {
  it("serves session errors for invalid jwt", async () => {
    const client = testClient(app);
    const response = await client.api["crowdin-app"].session.$post({
      json: { jwtToken: "not-a-jwt" },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "crowdin_jwt_invalid",
    });
  });

  it("rejects install payloads missing secrets", async () => {
    const client = testClient(app);
    const response = await client.api["crowdin-app"].events.installed.$post({
      json: {
        appId: "app",
        // missing appSecret
        organizationId: 1,
        userId: 2,
        baseUrl: "https://api.crowdin.com",
      } as never,
    });

    expect(response.status).toBe(400);
  });

  it("accepts a structurally valid jwt then fails closed without linked org", async () => {
    const token = jwt.sign(
      {
        aud: env.CROWDIN_APP_CLIENT_ID,
        sub: "7",
        context: {
          organization_id: 999001,
          user_id: 7,
          project_id: 42,
        },
      },
      env.CROWDIN_APP_CLIENT_SECRET!,
      { algorithm: "HS256", expiresIn: "5m" },
    );

    const client = testClient(app);
    const response = await client.api["crowdin-app"].session.$post({
      json: { jwtToken: token },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "crowdin_org_not_linked",
    });
  });
});
