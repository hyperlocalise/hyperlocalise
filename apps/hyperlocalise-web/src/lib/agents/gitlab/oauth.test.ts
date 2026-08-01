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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  buildGitlabAuthorizeUrl,
  exchangeGitlabAuthorizationCode,
  refreshGitlabAccessToken,
} from "./oauth";
import { isErr, isOk } from "@/lib/primitives/result/results";

describe("gitlab oauth helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds an authorize url with required scopes", () => {
    const url = new URL(
      buildGitlabAuthorizeUrl({
        state: "signed-state",
        redirectUri: "http://localhost:3000/api/auth/gitlab/callback",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://gitlab.com/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("scope")).toContain("read_repository");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/gitlab/callback",
    );
  });

  it("exchanges an authorization code for a token bundle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          access_token: "access-1",
          refresh_token: "refresh-1",
          token_type: "Bearer",
          expires_in: 7200,
          scope: "read_api read_repository read_user",
        }),
      ),
    );

    const result = await exchangeGitlabAuthorizationCode({
      code: "auth-code",
      redirectUri: "http://localhost:3000/api/auth/gitlab/callback",
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.accessToken).toBe("access-1");
      expect(result.value.refreshToken).toBe("refresh-1");
      expect(result.value.expiresAt).toBeTruthy();
    }
  });

  it("requires a refresh token on code exchange", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          access_token: "access-1",
          token_type: "Bearer",
          expires_in: 7200,
        }),
      ),
    );

    const result = await exchangeGitlabAuthorizationCode({
      code: "auth-code",
      redirectUri: "http://localhost:3000/api/auth/gitlab/callback",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("gitlab_token_response_invalid");
    }
  });

  it("refreshes an access token and preserves refresh token when omitted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          access_token: "access-2",
          token_type: "Bearer",
          expires_in: 7200,
        }),
      ),
    );

    const result = await refreshGitlabAccessToken({
      refreshToken: "refresh-keep",
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.accessToken).toBe("access-2");
      expect(result.value.refreshToken).toBe("refresh-keep");
    }
  });

  it("returns a Result when fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND gitlab.com");
      }),
    );

    const result = await exchangeGitlabAuthorizationCode({
      code: "auth-code",
      redirectUri: "http://localhost:3000/api/auth/gitlab/callback",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result) && result.error.code === "gitlab_token_exchange_failed") {
      expect(result.error.message).toContain("ENOTFOUND");
    } else {
      expect.fail("expected gitlab_token_exchange_failed");
    }
  });
});
