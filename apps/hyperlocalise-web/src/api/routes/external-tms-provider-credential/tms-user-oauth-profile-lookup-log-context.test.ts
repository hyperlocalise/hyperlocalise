import { describe, expect, it } from "vite-plus/test";

import {
  buildTmsUserOAuthProfileLookupLogContext,
  extractRequestPathFromProviderApiError,
  isSafeProviderErrorMessage,
  sanitizeProviderApiErrorResponseBody,
} from "./tms-user-oauth-profile-lookup-log-context";

describe("isSafeProviderErrorMessage", () => {
  it("accepts generic provider messages", () => {
    expect(isSafeProviderErrorMessage("Unauthorized")).toBe(true);
  });

  it("rejects messages containing email addresses", () => {
    expect(isSafeProviderErrorMessage("User user@example.com is not allowed")).toBe(false);
    expect(isSafeProviderErrorMessage("contact support@crowdin.com")).toBe(false);
  });
});

describe("sanitizeProviderApiErrorResponseBody", () => {
  it("extracts Crowdin-style nested error codes and messages", () => {
    expect(
      sanitizeProviderApiErrorResponseBody({
        error: { code: 401, message: "Unauthorized" },
      }),
    ).toEqual({
      providerErrorCode: 401,
      providerErrorMessage: "Unauthorized",
    });
  });

  it("omits unsafe nested messages", () => {
    expect(
      sanitizeProviderApiErrorResponseBody({
        error: { code: 401, message: "Invalid token for user@example.com" },
      }),
    ).toEqual({
      providerErrorCode: 401,
    });
  });

  it("extracts top-level message fields when safe", () => {
    expect(
      sanitizeProviderApiErrorResponseBody({
        message: "Invalid access token",
      }),
    ).toEqual({
      providerErrorMessage: "Invalid access token",
    });
  });
});

describe("extractRequestPathFromProviderApiError", () => {
  it("parses request paths from provider API error messages", () => {
    expect(
      extractRequestPathFromProviderApiError(new Error("Crowdin API returned HTTP 401 for /user")),
    ).toBe("/user");
    expect(
      extractRequestPathFromProviderApiError(
        new Error("Phrase TMS API returned HTTP 401 for /api2/v1/auth/whoAmI"),
      ),
    ).toBe("/api2/v1/auth/whoAmI");
  });
});

describe("buildTmsUserOAuthProfileLookupLogContext", () => {
  it("builds Crowdin enterprise diagnostics for provider API errors", () => {
    class CrowdinApiError extends Error {
      readonly name = "CrowdinApiError";

      constructor(
        message: string,
        readonly status: number,
        readonly responseBody: unknown,
      ) {
        super(message);
      }
    }

    const context = buildTmsUserOAuthProfileLookupLogContext({
      provider: "crowdin",
      credentialBaseUrl: "https://heidihealth.api.crowdin.com/api/v2",
      error: new CrowdinApiError("Crowdin API returned HTTP 401 for /user", 401, {
        error: { code: 401, message: "Unauthorized" },
      }),
    });

    expect(context).toEqual({
      provider: "crowdin",
      apiHostname: "heidihealth.api.crowdin.com",
      isCustomBaseUrl: true,
      requestPath: "/user",
      status: 401,
      providerErrorCode: 401,
      providerErrorMessage: "Unauthorized",
      errorName: "CrowdinApiError",
    });
  });

  it("uses default Crowdin.com hostname when no custom base URL is configured", () => {
    const context = buildTmsUserOAuthProfileLookupLogContext({
      provider: "crowdin",
      credentialBaseUrl: null,
      error: new Error("fetch failed"),
    });

    expect(context).toMatchObject({
      provider: "crowdin",
      apiHostname: "api.crowdin.com",
      isCustomBaseUrl: false,
      requestPath: "/user",
      status: null,
      errorName: "Error",
      errorType: "Error",
    });
  });

  it("includes Lokalise resolution codes without provider API status", () => {
    class LokaliseOAuthUserResolutionError extends Error {
      readonly name = "LokaliseOAuthUserResolutionError";

      constructor(readonly code: string) {
        super(code);
      }
    }

    const context = buildTmsUserOAuthProfileLookupLogContext({
      provider: "lokalise",
      credentialBaseUrl: null,
      error: new LokaliseOAuthUserResolutionError("no_projects"),
      resolutionCode: "no_projects",
    });

    expect(context).toMatchObject({
      provider: "lokalise",
      apiHostname: "api.lokalise.com",
      isCustomBaseUrl: false,
      requestPath: "/projects",
      status: null,
      resolutionCode: "no_projects",
      errorName: "LokaliseOAuthUserResolutionError",
      errorType: "LokaliseOAuthUserResolutionError",
    });
  });
});
