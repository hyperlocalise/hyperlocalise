import { describe, expect, it } from "vite-plus/test";

import { parseSmartlingCredentials } from "./smartling-credentials";

describe("parseSmartlingCredentials", () => {
  it("parses JSON credentials with account and project identifiers", () => {
    expect(
      parseSmartlingCredentials(
        JSON.stringify({
          userIdentifier: "user-1",
          userSecret: "secret-1",
          accountUid: "acct-1",
          projectId: "proj-1",
        }),
      ),
    ).toEqual({
      userIdentifier: "user-1",
      userSecret: "secret-1",
      accountUid: "acct-1",
      projectId: "proj-1",
    });
  });

  it("parses compact user:secret:accountUid credentials", () => {
    expect(parseSmartlingCredentials("user-1:secret-1:acct-1")).toEqual({
      userIdentifier: "user-1",
      userSecret: "secret-1",
      accountUid: "acct-1",
    });
  });

  it("parses compact user:secret credentials", () => {
    expect(parseSmartlingCredentials("user-1:secret-1")).toEqual({
      userIdentifier: "user-1",
      userSecret: "secret-1",
    });
  });

  it("parses JSON credentials when the secret contains colons", () => {
    expect(
      parseSmartlingCredentials(
        JSON.stringify({
          userIdentifier: "user-1",
          userSecret: "secret:with:colons",
        }),
      ),
    ).toEqual({
      userIdentifier: "user-1",
      userSecret: "secret:with:colons",
    });
  });

  it("rejects empty credentials", () => {
    expect(() => parseSmartlingCredentials("   ")).toThrow("smartling_credentials_invalid");
  });
});
