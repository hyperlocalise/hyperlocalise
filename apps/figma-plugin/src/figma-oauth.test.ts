import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  buildFigmaAuthorizeUrl,
  createPkceVerifier,
  createPkceChallenge,
  figmaOAuthRedirectUri,
  refreshFigmaOAuthSession,
} from "./figma-oauth";

describe("figma-oauth", () => {
  it("builds authorize URL with PKCE parameters", async () => {
    const verifier = createPkceVerifier();
    const challenge = await createPkceChallenge(verifier);
    const redirectUri = figmaOAuthRedirectUri("http://localhost:3000");
    const url = buildFigmaAuthorizeUrl({
      appUrl: "http://localhost:3000",
      clientId: "test-client",
      redirectUri,
      codeChallenge: challenge,
      state: "state-123",
    });
    expect(url).toContain("/api/oauth/figma/authorize");
    expect(url).toContain("code_challenge=");
    expect(url).toContain("client_id=test-client");
    expect(url).toContain(encodeURIComponent(redirectUri));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refreshes an expired access token when a refresh token is stored", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/integrations/figma/health")) {
        return new Response(
          JSON.stringify({
            ok: true,
            figmaOauthConfigured: true,
            figmaOauthClientId: "figma-plugin",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/api/oauth/figma/token")) {
        return new Response(
          JSON.stringify({
            access_token: "hl_figma_at_new",
            refresh_token: "hl_figma_rt_new",
            expires_in: 3600,
            token_type: "Bearer",
            scope: "figma",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await refreshFigmaOAuthSession({
      appUrl: "http://localhost:3000",
      refreshToken: "hl_figma_rt_old",
    });

    expect(tokens?.access_token).toBe("hl_figma_at_new");
    expect(tokens?.refresh_token).toBe("hl_figma_rt_new");
  });

  it("returns null when no refresh token is stored", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      refreshFigmaOAuthSession({ appUrl: "http://localhost:3000", refreshToken: null }),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
