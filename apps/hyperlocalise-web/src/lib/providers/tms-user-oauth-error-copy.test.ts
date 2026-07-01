import { describe, expect, it } from "vite-plus/test";

import { getTmsUserOAuthErrorCopy, isTmsUserOAuthErrorCode } from "./tms-user-oauth-error-copy";

describe("tms-user-oauth-error-copy", () => {
  it("recognizes known TMS user OAuth error codes", () => {
    expect(isTmsUserOAuthErrorCode("crowdin_user_oauth_invalid")).toBe(true);
    expect(isTmsUserOAuthErrorCode("crowdin_user_oauth_enterprise_mismatch")).toBe(true);
    expect(isTmsUserOAuthErrorCode("invalid_lokalise_oauth_state")).toBe(true);
    expect(isTmsUserOAuthErrorCode("github_oauth_failed")).toBe(false);
  });

  it("returns copy for known codes and null otherwise", () => {
    expect(getTmsUserOAuthErrorCopy("crowdin_user_oauth_invalid")).toEqual({
      title: "Crowdin account link failed",
      description:
        "Crowdin returned an access token, but the Crowdin API rejected it when loading your profile. Try connecting again. If it keeps failing, verify the OAuth app client ID and secret in Integrations.",
    });
    expect(getTmsUserOAuthErrorCopy("crowdin_user_oauth_enterprise_mismatch")).toMatchObject({
      title: "Crowdin Enterprise account link failed",
    });
    expect(getTmsUserOAuthErrorCopy("unknown_error")).toBeNull();
    expect(getTmsUserOAuthErrorCopy(null)).toBeNull();
  });
});
