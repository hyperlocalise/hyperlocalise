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
  authenticateSanityOauthClient,
  buildSanityOauthRedirect,
  createSanityOauthAuthorizationRequest,
  digestSanityOauthToken,
  generateSanityOauthAccessToken,
  generateSanityOauthRefreshToken,
  isAllowedSanityOauthRedirectUri,
  parseSanityOauthAuthorizationRequest,
  verifyPkceChallenge,
} from "./oauth";

const VERIFIER = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

const REDIRECT_URI = "http://localhost:3000/connect/sanity/oauth/callback";

function authorizationRequest(overrides: { redirectUri?: string; state?: string } = {}) {
  return createSanityOauthAuthorizationRequest({
    clientId: "test-sanity-oauth-client",
    redirectUri: overrides.redirectUri ?? REDIRECT_URI,
    codeChallenge: pkceChallenge(VERIFIER),
    codeChallengeMethod: "S256",
    scope: "sanity",
    state: overrides.state ?? "sanity-state",
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

describe("Sanity OAuth authorization cookies", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips a signed request", () => {
    const token = authorizationRequest();
    const parsed = parseSanityOauthAuthorizationRequest(token);
    expect(parsed).toMatchObject({
      clientId: "test-sanity-oauth-client",
      redirectUri: REDIRECT_URI,
      codeChallengeMethod: "S256",
      scope: "sanity",
      state: "sanity-state",
    });
    expect(parsed?.codeChallenge).toBe(pkceChallenge(VERIFIER));
  });

  it("rejects a tampered signature", () => {
    const token = authorizationRequest();
    const [payload, signature] = token.split(".");
    const flipped = signature!.endsWith("a") ? "b" : "a";
    expect(
      parseSanityOauthAuthorizationRequest(`${payload}.${signature!.slice(0, -1)}${flipped}`),
    ).toBeNull();
  });

  it("rejects malformed and expired tokens", () => {
    expect(parseSanityOauthAuthorizationRequest("not-a-token")).toBeNull();
    expect(parseSanityOauthAuthorizationRequest("onlyonepart.")).toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const token = authorizationRequest();
    vi.setSystemTime(new Date("2026-01-01T00:16:00.000Z"));
    expect(parseSanityOauthAuthorizationRequest(token)).toBeNull();
  });
});

describe("authenticateSanityOauthClient", () => {
  it("accepts the configured client id from the body or Basic header", () => {
    expect(authenticateSanityOauthClient({ clientId: "test-sanity-oauth-client" })).toBe(true);
    expect(
      authenticateSanityOauthClient({
        authorizationHeader: `Basic ${Buffer.from("test-sanity-oauth-client:").toString("base64")}`,
      }),
    ).toBe(true);
  });

  it("rejects missing, wrong, or undecodable client credentials", () => {
    expect(authenticateSanityOauthClient({})).toBe(false);
    expect(authenticateSanityOauthClient({ clientId: "other-client" })).toBe(false);
    expect(authenticateSanityOauthClient({ authorizationHeader: "Bearer nope" })).toBe(false);
  });
});

describe("Sanity OAuth redirects and tokens", () => {
  it("allows the default Sanity redirect and rejects unknown URIs", () => {
    expect(isAllowedSanityOauthRedirectUri(REDIRECT_URI)).toBe(true);
    expect(isAllowedSanityOauthRedirectUri("https://evil.example/callback")).toBe(false);
  });

  it("preserves state on success and error redirects", () => {
    expect(
      buildSanityOauthRedirect({
        redirectUri: REDIRECT_URI,
        code: "auth-code",
        state: "sanity-state",
      }),
    ).toBe(`${REDIRECT_URI}?code=auth-code&state=sanity-state`);
    expect(
      buildSanityOauthRedirect({
        redirectUri: REDIRECT_URI,
        error: "access_denied",
        errorDescription: "User declined",
        state: "sanity-state",
      }),
    ).toBe(
      `${REDIRECT_URI}?error=access_denied&error_description=User+declined&state=sanity-state`,
    );
  });

  it("mints prefixed tokens and a stable lookup digest", () => {
    expect(generateSanityOauthAccessToken()).toMatch(/^hl_sanity_at_/);
    expect(generateSanityOauthRefreshToken()).toMatch(/^hl_sanity_rt_/);
    expect(digestSanityOauthToken("same-token")).toBe(digestSanityOauthToken("same-token"));
    expect(digestSanityOauthToken("same-token")).not.toBe(digestSanityOauthToken("other-token"));
  });
});
