/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import "dotenv/config";

import { describe, expect, it } from "vite-plus/test";

import { app } from "@/api/app";
import { env } from "@/lib/env";
import {
  GO_SVC_SERVICE_TOKEN_HEADER,
  mintGoSvcServiceToken,
} from "@/lib/go-svc/go-svc-service-token";
import { WEBHOOK_SECRET_PREFIX } from "@/lib/outbound-webhooks/webhook-signing";
import { isErr } from "@/lib/primitives/result/results";
import { decryptProviderCredential } from "@/lib/security/provider-credential-crypto";

function serviceHeaders() {
  const password = env.WORKOS_COOKIE_PASSWORD;
  if (!password) {
    throw new Error("WORKOS_COOKIE_PASSWORD is required for internal webhook route tests");
  }
  return {
    [GO_SVC_SERVICE_TOKEN_HEADER]: mintGoSvcServiceToken(password),
  };
}

describe("internal webhook signing-secret route", () => {
  it("rejects requests without the service token", async () => {
    const response = await app.request("/api/internal/webhooks/signing-secret", {
      method: "POST",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "unauthorized" });
  });

  it("rejects a wrong service token", async () => {
    const response = await app.request("/api/internal/webhooks/signing-secret", {
      method: "POST",
      headers: { [GO_SVC_SERVICE_TOKEN_HEADER]: "deadbeef" },
    });

    expect(response.status).toBe(401);
  });

  it("mints a secret the delivery cron can decrypt", async () => {
    const response = await app.request("/api/internal/webhooks/signing-secret", {
      method: "POST",
      headers: serviceHeaders(),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      secret: string;
      encrypted: {
        algorithm: string;
        keyVersion: number;
        ciphertext: string;
        iv: string;
        authTag: string;
      };
    };
    expect(body.secret.startsWith(WEBHOOK_SECRET_PREFIX)).toBe(true);
    expect(JSON.stringify(body.encrypted)).not.toContain(body.secret);

    const decrypted = decryptProviderCredential(body.encrypted);
    expect(isErr(decrypted)).toBe(false);
    if (!isErr(decrypted)) {
      expect(decrypted.value).toBe(body.secret);
    }
  });
});
