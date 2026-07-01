import { describe, expect, it } from "vite-plus/test";

import {
  buildTmsUserOAuthProfileLookupLogContext,
  buildTmsUserOAuthTokenExchangeErroredLogContext,
  buildTmsUserOAuthTokenExchangeFailedLogContext,
  extractRequestPathFromProviderApiError,
  isSafeOAuthErrorCode,
  isSafeProviderErrorMessage,
  readOAuthTokenErrorResponseBody,
  sanitizeOAuthTokenErrorResponseBody,
  sanitizeProviderApiErrorResponseBody,
} from "./tms-user-oauth-log-context";

describe("isSafeProviderErrorMessage", () => {
  it("accepts generic provider messages", () => {
    expect(isSafeProviderErrorMessage("Unauthorized")).toBe(true);
  });

  it("rejects messages containing email addresses", () => {
    expect(isSafeProviderErrorMessage("User user@example.com is not allowed")).toBe(false);
    expect(isSafeProviderErrorMessage("contact support@crowdin.com")).toBe(false);
  });
});

describe("isSafeOAuthErrorCode", () => {
  it("accepts standard OAuth error codes", () => {
    expect(isSafeOAuthErrorCode("invalid_grant")).toBe(true);
    expect(isSafeOAuthErrorCode("redirect_uri_mismatch")).toBe(true);
    expect(isSafeOAuthErrorCode("invalid_client")).toBe(true);
  });

  it("rejects unsafe or malformed codes", () => {
    expect(isSafeOAuthErrorCode("Invalid Grant")).toBe(false);
    expect(isSafeOAuthErrorCode("user@example.com")).toBe(false);
    expect(isSafeOAuthErrorCode("")).toBe(false);
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

describe("sanitizeOAuthTokenErrorResponseBody", () => {
  it("extracts standard OAuth token error fields", () => {
    expect(
      sanitizeOAuthTokenErrorResponseBody({
        error: "invalid_grant",
        error_description: "The authorization code has expired",
      }),
    ).toEqual({
      oauthError: "invalid_grant",
      oauthErrorDescription: "The authorization code has expired",
    });
  });

  it("extracts redirect_uri_mismatch diagnostics", () => {
    expect(
      sanitizeOAuthTokenErrorResponseBody({
        error: "redirect_uri_mismatch",
        error_description: "The redirect URI included in the request does not match",
      }),
    ).toEqual({
      oauthError: "redirect_uri_mismatch",
      oauthErrorDescription: "The redirect URI included in the request does not match",
    });
  });

  it("omits unsafe error descriptions", () => {
    expect(
      sanitizeOAuthTokenErrorResponseBody({
        error: "invalid_grant",
        error_description: "Token rejected for user@example.com",
      }),
    ).toEqual({
      oauthError: "invalid_grant",
    });
  });

  it("returns null for success token payloads", () => {
    expect(
      sanitizeOAuthTokenErrorResponseBody({
        access_token: "secret-token",
        token_type: "Bearer",
      }),
    ).toBeNull();
  });

  it("falls back to provider-style nested errors", () => {
    expect(
      sanitizeOAuthTokenErrorResponseBody({
        error: { code: 400, message: "Bad request" },
      }),
    ).toEqual({
      providerErrorCode: 400,
      providerErrorMessage: "Bad request",
    });
  });
});

describe("readOAuthTokenErrorResponseBody", () => {
  it("returns parsed JSON for error responses", async () => {
    const response = new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    await expect(readOAuthTokenErrorResponseBody(response)).resolves.toEqual({
      error: "invalid_grant",
    });
  });

  it("returns null when the body contains tokens", async () => {
    const response = new Response(
      JSON.stringify({ access_token: "secret", refresh_token: "secret" }),
      { status: 500 },
    );
    await expect(readOAuthTokenErrorResponseBody(response)).resolves.toBeNull();
  });

  it("returns null for invalid JSON", async () => {
    const response = new Response("not-json", { status: 400 });
    await expect(readOAuthTokenErrorResponseBody(response)).resolves.toBeNull();
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

describe("buildTmsUserOAuthTokenExchangeFailedLogContext", () => {
  it("builds Crowdin token exchange diagnostics for invalid_grant", () => {
    const context = buildTmsUserOAuthTokenExchangeFailedLogContext({
      provider: "crowdin",
      credentialBaseUrl: "https://enterprise.crowdin.test/api/v2",
      status: 400,
      redirectUri: "https://app.example.com/api/auth/crowdin/callback",
      responseBody: {
        error: "invalid_grant",
        error_description: "The authorization code has expired",
      },
    });

    expect(context).toEqual({
      provider: "crowdin",
      status: 400,
      redirectUri: "https://app.example.com/api/auth/crowdin/callback",
      apiHostname: "enterprise.crowdin.test",
      isCustomBaseUrl: true,
      oauthError: "invalid_grant",
      oauthErrorDescription: "The authorization code has expired",
    });
  });

  it("builds Phrase token exchange diagnostics for redirect_uri_mismatch", () => {
    const context = buildTmsUserOAuthTokenExchangeFailedLogContext({
      provider: "phrase",
      credentialBaseUrl: null,
      status: 400,
      redirectUri: "https://app.example.com/api/auth/phrase/callback",
      responseBody: {
        error: "redirect_uri_mismatch",
        error_description: "The redirect URI included in the request does not match",
      },
    });

    expect(context).toMatchObject({
      provider: "phrase",
      status: 400,
      redirectUri: "https://app.example.com/api/auth/phrase/callback",
      apiHostname: "cloud.memsource.com",
      isCustomBaseUrl: false,
      oauthError: "redirect_uri_mismatch",
      oauthErrorDescription: "The redirect URI included in the request does not match",
    });
  });
});

describe("buildTmsUserOAuthTokenExchangeErroredLogContext", () => {
  it("includes network error metadata without secrets", () => {
    const context = buildTmsUserOAuthTokenExchangeErroredLogContext({
      provider: "crowdin",
      credentialBaseUrl: null,
      redirectUri: "https://app.example.com/api/auth/crowdin/callback",
      error: new TypeError("fetch failed"),
    });

    expect(context).toMatchObject({
      provider: "crowdin",
      redirectUri: "https://app.example.com/api/auth/crowdin/callback",
      apiHostname: "api.crowdin.com",
      isCustomBaseUrl: false,
      errorName: "TypeError",
      errorType: "TypeError",
    });
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
      credentialBaseUrl: "https://enterprise.crowdin.test/api/v2",
      error: new CrowdinApiError("Crowdin API returned HTTP 401 for /user", 401, {
        error: { code: 401, message: "Unauthorized" },
      }),
    });

    expect(context).toEqual({
      provider: "crowdin",
      apiHostname: "enterprise.crowdin.test",
      isCustomBaseUrl: true,
      apiEndpoint: "https://enterprise.crowdin.test/api/v2/user",
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
      apiEndpoint: "https://api.crowdin.com/api/v2/user",
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
      apiEndpoint: "https://api.lokalise.com/api2/projects",
      status: null,
      resolutionCode: "no_projects",
      errorName: "LokaliseOAuthUserResolutionError",
      errorType: "LokaliseOAuthUserResolutionError",
    });
  });
});
