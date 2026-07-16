import { describe, expect, it } from "vite-plus/test";

import {
  CROWDIN_EMBED_SESSION_TOKEN_PREFIX,
  buildCrowdinEmbedSessionCookie,
  mintCrowdinEmbedSessionToken,
  verifyCrowdinEmbedSessionToken,
} from "./embed-session";

describe("crowdin embed session", () => {
  it("mints and verifies a prefixed token", () => {
    const token = mintCrowdinEmbedSessionToken({
      hlUserId: "11111111-1111-1111-1111-111111111111",
      hlOrganizationId: "22222222-2222-2222-2222-222222222222",
      hlOrganizationSlug: "acme",
      hlProjectId: "ext:crowdin:1",
      crowdinUserId: 7,
      crowdinOrganizationId: 42,
      crowdinProjectId: 1,
    });

    expect(token.startsWith(CROWDIN_EMBED_SESSION_TOKEN_PREFIX)).toBe(true);

    const verified = verifyCrowdinEmbedSessionToken(token);
    expect(verified).toMatchObject({
      hlOrganizationSlug: "acme",
      hlProjectId: "ext:crowdin:1",
      crowdinUserId: 7,
    });
  });

  it("rejects tampered tokens", () => {
    const token = mintCrowdinEmbedSessionToken({
      hlUserId: "11111111-1111-1111-1111-111111111111",
      hlOrganizationId: "22222222-2222-2222-2222-222222222222",
      hlOrganizationSlug: "acme",
      hlProjectId: "ext:crowdin:1",
      crowdinUserId: 7,
      crowdinOrganizationId: 42,
      crowdinProjectId: 1,
    });

    expect(verifyCrowdinEmbedSessionToken(`${token}x`)).toEqual({
      error: "crowdin_embed_session_invalid",
    });
  });

  it("always sets Secure with SameSite=None on the embed cookie", () => {
    const cookie = buildCrowdinEmbedSessionCookie("hlce_test");
    expect(cookie).toContain("SameSite=None");
    expect(cookie).toContain("Secure");
  });
});
