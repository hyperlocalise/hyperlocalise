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
import { generateKeyPairSync } from "node:crypto";

import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { env } from "@/lib/env";
import { isErr, isOk } from "@/lib/primitives/result/results";
import {
  getPublicApiProtectedResourceMetadata,
  isCompactJwt,
  setAgentAccessTokenPublicKeyResolverForTest,
  verifyWorkosAgentAccessToken,
} from "@/lib/workos/agent-access-token";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

function signAgentToken(
  claims: Record<string, unknown>,
  expiresIn: jwt.SignOptions["expiresIn"] | undefined = "5m",
) {
  return jwt.sign(claims, privateKey, {
    algorithm: "RS256",
    keyid: "test-kid",
    ...(expiresIn ? { expiresIn } : {}),
  });
}

describe("agent access tokens", () => {
  afterEach(() => {
    setAgentAccessTokenPublicKeyResolverForTest(null);
  });

  it("detects compact JWTs and rejects opaque tokens", () => {
    expect(isCompactJwt("aaa.bbb.ccc")).toBe(true);
    expect(isCompactJwt("hl_mcp_opaque")).toBe(false);
    expect(isCompactJwt("a.b")).toBe(false);
  });

  it("advertises AuthKit as the public API authorization server", () => {
    expect(getPublicApiProtectedResourceMetadata("https://www.hyperlocalise.com")).toMatchObject({
      resource: "https://www.hyperlocalise.com/api/v1",
      authorization_servers: ["https://authkit.test"],
      scopes_supported: ["jobs:read", "jobs:write", "files:read", "files:write", "mcp"],
    });
  });

  it("accepts a claimed token signed for the AuthKit issuer", async () => {
    setAgentAccessTokenPublicKeyResolverForTest(async () => publicKey.export({ type: "spki", format: "pem" }).toString());

    const token = signAgentToken({
      iss: "https://authkit.test",
      aud: env.WORKOS_CLIENT_ID,
      sub: "agent_reg_01TEST",
      org_id: "org_claimed",
      scope: "mcp jobs:read",
      act: { sub: "user_claimed" },
    });

    const result = await verifyWorkosAgentAccessToken(token);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({
        registrationId: "agent_reg_01TEST",
        workosUserId: "user_claimed",
        workosOrganizationId: "org_claimed",
        scopes: ["mcp", "jobs:read"],
      });
    }
  });

  it("rejects expired tokens, wrong audiences, and unclaimed tokens", async () => {
    setAgentAccessTokenPublicKeyResolverForTest(async () => publicKey.export({ type: "spki", format: "pem" }).toString());

    const expired = signAgentToken(
      {
        iss: "https://authkit.test",
        aud: env.WORKOS_CLIENT_ID,
        sub: "agent_reg_01TEST",
        org_id: "org_claimed",
        scope: "mcp",
        act: { sub: "user_claimed" },
        iat: Math.floor(Date.now() / 1000) - 120,
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      undefined,
    );
    expect(isErr(await verifyWorkosAgentAccessToken(expired))).toBe(true);

    const wrongAud = signAgentToken({
      iss: "https://authkit.test",
      aud: "client_other",
      sub: "agent_reg_01TEST",
      org_id: "org_claimed",
      scope: "mcp",
      act: { sub: "user_claimed" },
    });
    expect(isErr(await verifyWorkosAgentAccessToken(wrongAud))).toBe(true);

    const unclaimed = signAgentToken({
      iss: "https://authkit.test",
      aud: env.WORKOS_CLIENT_ID,
      sub: "agent_reg_01TEST",
      org_id: "org_claimed",
      scope: "mcp",
    });
    expect(isErr(await verifyWorkosAgentAccessToken(unclaimed))).toBe(true);
  });
});
