/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { createHmac } from "node:crypto";

import jwt from "jsonwebtoken";
import { describe, expect, it } from "vite-plus/test";
import { testClient } from "hono/testing";

import { app } from "@/api/app";
import { env } from "@/lib/env";

function signCrowdinEventBody(rawBody: string) {
  return createHmac("sha256", env.CROWDIN_APP_CLIENT_SECRET!).update(rawBody, "utf8").digest("hex");
}

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

  it("rejects install events without a Crowdin signature", async () => {
    const response = await app.request("/api/crowdin-app/events/installed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appId: "app",
        appSecret: "secret",
        organizationId: 1,
        userId: 2,
        baseUrl: "https://api.crowdin.com",
      }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "crowdin_event_signature_missing",
    });
  });

  it("rejects signed install payloads missing secrets", async () => {
    const rawBody = JSON.stringify({
      appId: "app",
      organizationId: 1,
      userId: 2,
      baseUrl: "https://api.crowdin.com",
    });

    const response = await app.request("/api/crowdin-app/events/installed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Crowdin-Content-Checksum": signCrowdinEventBody(rawBody),
      },
      body: rawBody,
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
