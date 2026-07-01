import { describe, expect, it } from "vite-plus/test";

import { getTmsUserOAuthErrorCopy, isTmsUserOAuthErrorCode } from "./tms-user-oauth-error-copy";

describe("tms-user-oauth-error-copy", () => {
  it("recognizes known TMS user OAuth error codes", () => {
    expect(isTmsUserOAuthErrorCode("crowdin_user_oauth_invalid")).toBe(true);
    expect(isTmsUserOAuthErrorCode("invalid_lokalise_oauth_state")).toBe(true);
    expect(isTmsUserOAuthErrorCode("github_oauth_failed")).toBe(false);
  });

  it("returns copy for known codes and null otherwise", () => {
    expect(getTmsUserOAuthErrorCopy("crowdin_user_oauth_invalid")).toEqual({
      title: "Crowdin account link failed",
      description:
        "Crowdin rejected the access token returned during authorization. Try connecting again, then verify the OAuth app credentials if it repeats.",
    });
    expect(getTmsUserOAuthErrorCopy("unknown_error")).toBeNull();
    expect(getTmsUserOAuthErrorCopy(null)).toBeNull();
  });
});
