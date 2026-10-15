import { describe, expect, it } from "vite-plus/test";

import {
  buildFigmaAuthorizeUrl,
  createPkceVerifier,
  createPkceChallenge,
  figmaOAuthRedirectUri,
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
});
