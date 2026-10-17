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

import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  authenticateFigmaOauthClient,
  buildFigmaOauthRedirect,
  createFigmaOauthAuthorizationRequest,
  digestFigmaOauthToken,
  generateFigmaOauthAccessToken,
  generateFigmaOauthRefreshToken,
  isAllowedFigmaOauthRedirectUri,
  parseFigmaOauthAuthorizationRequest,
  verifyPkceChallenge,
} from "./oauth";

const VERIFIER = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function authorizationRequest(overrides: { redirectUri?: string; state?: string } = {}) {
  return createFigmaOauthAuthorizationRequest({
    clientId: "test-figma-oauth-client",
    redirectUri: overrides.redirectUri ?? "https://www.figma.com/apps/oauth/authorized",
    codeChallenge: pkceChallenge(VERIFIER),
    codeChallengeMethod: "S256",
    scope: "figma",
    state: overrides.state ?? "figma-state",
  });
}

describe("verifyPkceChallenge", () => {
  it("accepts the matching S256 verifier and rejects a wrong one", () => {
    const challenge = pkceChallenge(VERIFIER);
    expect(verifyPkceChallenge({ codeVerifier: VERIFIER, codeChallenge: challenge })).toBe(true);
    expect(
      verifyPkceChallenge({
        codeVerifier: `${VERIFIER.slice(0, -1)}x`,
        codeChallenge: challenge,
      }),
    ).toBe(false);
  });
});

describe("Figma OAuth authorization cookies", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips a signed request", () => {
    const token = authorizationRequest();
    const parsed = parseFigmaOauthAuthorizationRequest(token);
    expect(parsed).toMatchObject({
      clientId: "test-figma-oauth-client",
      redirectUri: "https://www.figma.com/apps/oauth/authorized",
      codeChallengeMethod: "S256",
      scope: "figma",
      state: "figma-state",
    });
    expect(parsed?.codeChallenge).toBe(pkceChallenge(VERIFIER));
  });

  it("rejects a tampered signature", () => {
    const token = authorizationRequest();
    const [payload, signature] = token.split(".");
    const flipped = signature!.endsWith("a") ? "b" : "a";
    expect(
      parseFigmaOauthAuthorizationRequest(`${payload}.${signature!.slice(0, -1)}${flipped}`),
    ).toBeNull();
  });

  it("rejects malformed and expired tokens", () => {
    expect(parseFigmaOauthAuthorizationRequest("not-a-token")).toBeNull();
    expect(parseFigmaOauthAuthorizationRequest("onlyonepart.")).toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const token = authorizationRequest();
    vi.setSystemTime(new Date("2026-01-01T00:16:00.000Z"));
    expect(parseFigmaOauthAuthorizationRequest(token)).toBeNull();
  });
});

describe("authenticateFigmaOauthClient", () => {
  it("accepts the configured client id from the body or Basic header", () => {
    expect(authenticateFigmaOauthClient({ clientId: "test-figma-oauth-client" })).toBe(true);
    expect(
      authenticateFigmaOauthClient({
        authorizationHeader: `Basic ${Buffer.from("test-figma-oauth-client:").toString("base64")}`,
      }),
    ).toBe(true);
  });

  it("rejects missing, wrong, or undecodable client credentials", () => {
    expect(authenticateFigmaOauthClient({})).toBe(false);
    expect(authenticateFigmaOauthClient({ clientId: "other-client" })).toBe(false);
    expect(authenticateFigmaOauthClient({ authorizationHeader: "Bearer nope" })).toBe(false);
  });
});

describe("Figma OAuth redirects and tokens", () => {
  it("allows the default Figma redirect and rejects unknown URIs", () => {
    expect(isAllowedFigmaOauthRedirectUri("https://www.figma.com/apps/oauth/authorized")).toBe(
      true,
    );
    expect(isAllowedFigmaOauthRedirectUri("https://evil.example/callback")).toBe(false);
  });

  it("preserves state on success and error redirects", () => {
    expect(
      buildFigmaOauthRedirect({
        redirectUri: "https://www.figma.com/apps/oauth/authorized",
        code: "auth-code",
        state: "figma-state",
      }),
    ).toBe("https://www.figma.com/apps/oauth/authorized?code=auth-code&state=figma-state");
    expect(
      buildFigmaOauthRedirect({
        redirectUri: "https://www.figma.com/apps/oauth/authorized",
        error: "access_denied",
        errorDescription: "User declined",
        state: "figma-state",
      }),
    ).toBe(
      "https://www.figma.com/apps/oauth/authorized?error=access_denied&error_description=User+declined&state=figma-state",
    );
  });

  it("mints prefixed tokens and a stable lookup digest", () => {
    expect(generateFigmaOauthAccessToken()).toMatch(/^hl_figma_at_/);
    expect(generateFigmaOauthRefreshToken()).toMatch(/^hl_figma_rt_/);
    expect(digestFigmaOauthToken("same-token")).toBe(digestFigmaOauthToken("same-token"));
    expect(digestFigmaOauthToken("same-token")).not.toBe(digestFigmaOauthToken("other-token"));
  });
});
