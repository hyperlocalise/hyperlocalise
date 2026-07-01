import { LOKALISE_DEFAULT_BASE_URL } from "@/lib/providers/adapters/lokalise/lokalise-api";
import {
  PHRASE_TMS_DEFAULT_BASE_URL,
  resolvePhraseTmsBaseUrl,
} from "@/lib/providers/adapters/phrase/phrase-tms-base-url";
import { requireProviderBaseUrl } from "@/lib/providers/provider-url-safety";

const CROWDIN_DEFAULT_BASE_URL = "https://api.crowdin.com/api/v2";

const PROVIDER_API_PATH_PATTERN = / returned HTTP \d+ for (.+)$/;

export type TmsUserOAuthProvider = "crowdin" | "phrase" | "lokalise";

type ProviderOAuthProfileLookupConfig = {
  defaultBaseUrl: string;
  defaultRequestPath: string;
  resolveBaseUrl: (baseUrl?: string | null) => string;
};

const PROVIDER_OAUTH_PROFILE_LOOKUP_CONFIG: Record<
  TmsUserOAuthProvider,
  ProviderOAuthProfileLookupConfig
> = {
  crowdin: {
    defaultBaseUrl: CROWDIN_DEFAULT_BASE_URL,
    defaultRequestPath: "/user",
    resolveBaseUrl: (baseUrl) =>
      requireProviderBaseUrl(baseUrl, CROWDIN_DEFAULT_BASE_URL, "Crowdin"),
  },
  phrase: {
    defaultBaseUrl: PHRASE_TMS_DEFAULT_BASE_URL,
    defaultRequestPath: "/api2/v1/auth/whoAmI",
    resolveBaseUrl: (baseUrl) => resolvePhraseTmsBaseUrl({ baseUrl }),
  },
  lokalise: {
    defaultBaseUrl: LOKALISE_DEFAULT_BASE_URL,
    defaultRequestPath: "/projects",
    resolveBaseUrl: (baseUrl) =>
      requireProviderBaseUrl(baseUrl, LOKALISE_DEFAULT_BASE_URL, "Lokalise"),
  },
};

type ProviderApiErrorLike = Error & {
  status: number;
  responseBody: unknown;
};

export type TmsUserOAuthProfileLookupLogContext = {
  provider: TmsUserOAuthProvider;
  apiHostname: string;
  isCustomBaseUrl: boolean;
  requestPath: string;
  status: number | null;
  providerErrorCode?: string | number;
  providerErrorMessage?: string;
  errorName?: string;
  errorType?: string;
  resolutionCode?: string;
};

export type TmsUserOAuthTokenExchangeFailedLogContext = {
  provider: TmsUserOAuthProvider;
  status: number;
  redirectUri: string;
  apiHostname: string;
  isCustomBaseUrl: boolean;
  oauthError?: string;
  oauthErrorDescription?: string;
  providerErrorCode?: string | number;
  providerErrorMessage?: string;
};

export type TmsUserOAuthTokenExchangeErroredLogContext = {
  provider: TmsUserOAuthProvider;
  redirectUri: string;
  apiHostname: string;
  isCustomBaseUrl: boolean;
  errorName?: string;
  errorType?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProviderApiError(error: unknown): error is ProviderApiErrorLike {
  return (
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number" &&
    "responseBody" in error
  );
}

export function isSafeProviderErrorMessage(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) {
    return false;
  }

  if (trimmed.includes("@")) {
    return false;
  }

  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(trimmed)) {
    return false;
  }

  return true;
}

export function isSafeOAuthErrorCode(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) {
    return false;
  }

  return /^[a-z0-9_]+$/.test(trimmed);
}

export function sanitizeProviderApiErrorResponseBody(responseBody: unknown): {
  providerErrorCode?: string | number;
  providerErrorMessage?: string;
} | null {
  if (!isRecord(responseBody)) {
    if (isSafeProviderErrorMessage(responseBody)) {
      return { providerErrorMessage: responseBody };
    }
    return null;
  }

  const sanitized: {
    providerErrorCode?: string | number;
    providerErrorMessage?: string;
  } = {};

  const nestedError = responseBody.error;
  if (isRecord(nestedError)) {
    if (typeof nestedError.code === "number" || typeof nestedError.code === "string") {
      sanitized.providerErrorCode = nestedError.code;
    }
    if (isSafeProviderErrorMessage(nestedError.message)) {
      sanitized.providerErrorMessage = nestedError.message;
    }
  } else if (typeof nestedError === "string" && isSafeProviderErrorMessage(nestedError)) {
    sanitized.providerErrorMessage = nestedError;
  }

  if (sanitized.providerErrorCode === undefined) {
    if (typeof responseBody.code === "number" || typeof responseBody.code === "string") {
      sanitized.providerErrorCode = responseBody.code;
    }
  }

  if (!sanitized.providerErrorMessage && isSafeProviderErrorMessage(responseBody.message)) {
    sanitized.providerErrorMessage = responseBody.message;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

export function sanitizeOAuthTokenErrorResponseBody(responseBody: unknown): {
  oauthError?: string;
  oauthErrorDescription?: string;
  providerErrorCode?: string | number;
  providerErrorMessage?: string;
} | null {
  if (!isRecord(responseBody)) {
    return sanitizeProviderApiErrorResponseBody(responseBody);
  }

  if ("access_token" in responseBody || "refresh_token" in responseBody) {
    return null;
  }

  const sanitized: {
    oauthError?: string;
    oauthErrorDescription?: string;
    providerErrorCode?: string | number;
    providerErrorMessage?: string;
  } = {};

  if (isSafeOAuthErrorCode(responseBody.error)) {
    sanitized.oauthError = responseBody.error;
  }

  if (isSafeProviderErrorMessage(responseBody.error_description)) {
    sanitized.oauthErrorDescription = responseBody.error_description;
  }

  const providerSanitized = sanitizeProviderApiErrorResponseBody(responseBody);
  if (providerSanitized?.providerErrorCode !== undefined) {
    sanitized.providerErrorCode = providerSanitized.providerErrorCode;
  }
  if (
    providerSanitized?.providerErrorMessage &&
    providerSanitized.providerErrorMessage !== sanitized.oauthError
  ) {
    sanitized.providerErrorMessage = providerSanitized.providerErrorMessage;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

export async function readOAuthTokenErrorResponseBody(response: Response): Promise<unknown> {
  try {
    const body = await response.json();
    if (isRecord(body) && ("access_token" in body || "refresh_token" in body)) {
      return null;
    }
    return body;
  } catch {
    return null;
  }
}

export function extractRequestPathFromProviderApiError(error: Error): string | null {
  const match = error.message.match(PROVIDER_API_PATH_PATTERN);
  return match?.[1] ?? null;
}

function resolveApiHostname(baseUrl: string): string {
  return new URL(baseUrl).hostname;
}

function buildCredentialHostContext(input: {
  provider: TmsUserOAuthProvider;
  credentialBaseUrl: string | null | undefined;
}) {
  const config = PROVIDER_OAUTH_PROFILE_LOOKUP_CONFIG[input.provider];
  const resolvedBaseUrl = config.resolveBaseUrl(input.credentialBaseUrl);

  return {
    provider: input.provider,
    apiHostname: resolveApiHostname(resolvedBaseUrl),
    isCustomBaseUrl: Boolean(input.credentialBaseUrl?.trim()),
  };
}

export function buildTmsUserOAuthTokenExchangeFailedLogContext(input: {
  provider: TmsUserOAuthProvider;
  credentialBaseUrl: string | null | undefined;
  status: number;
  redirectUri: string;
  responseBody: unknown;
}): TmsUserOAuthTokenExchangeFailedLogContext {
  const context: TmsUserOAuthTokenExchangeFailedLogContext = {
    ...buildCredentialHostContext(input),
    status: input.status,
    redirectUri: input.redirectUri,
  };

  const sanitizedResponse = sanitizeOAuthTokenErrorResponseBody(input.responseBody);
  if (sanitizedResponse?.oauthError) {
    context.oauthError = sanitizedResponse.oauthError;
  }
  if (sanitizedResponse?.oauthErrorDescription) {
    context.oauthErrorDescription = sanitizedResponse.oauthErrorDescription;
  }
  if (sanitizedResponse?.providerErrorCode !== undefined) {
    context.providerErrorCode = sanitizedResponse.providerErrorCode;
  }
  if (sanitizedResponse?.providerErrorMessage) {
    context.providerErrorMessage = sanitizedResponse.providerErrorMessage;
  }

  return context;
}

export function buildTmsUserOAuthTokenExchangeErroredLogContext(input: {
  provider: TmsUserOAuthProvider;
  credentialBaseUrl: string | null | undefined;
  redirectUri: string;
  error: unknown;
}): TmsUserOAuthTokenExchangeErroredLogContext {
  const context: TmsUserOAuthTokenExchangeErroredLogContext = {
    ...buildCredentialHostContext(input),
    redirectUri: input.redirectUri,
  };

  if (input.error instanceof Error) {
    context.errorName = input.error.name;
    context.errorType = input.error.constructor.name;
  } else {
    context.errorType = typeof input.error;
  }

  return context;
}

export function buildTmsUserOAuthProfileLookupLogContext(input: {
  provider: TmsUserOAuthProvider;
  credentialBaseUrl: string | null | undefined;
  error: unknown;
  resolutionCode?: string | null;
}): TmsUserOAuthProfileLookupLogContext {
  const config = PROVIDER_OAUTH_PROFILE_LOOKUP_CONFIG[input.provider];
  const resolvedBaseUrl = config.resolveBaseUrl(input.credentialBaseUrl);
  const context: TmsUserOAuthProfileLookupLogContext = {
    provider: input.provider,
    apiHostname: resolveApiHostname(resolvedBaseUrl),
    isCustomBaseUrl: Boolean(input.credentialBaseUrl?.trim()),
    requestPath: config.defaultRequestPath,
    status: null,
  };

  if (input.resolutionCode) {
    context.resolutionCode = input.resolutionCode;
  }

  if (isProviderApiError(input.error)) {
    context.status = input.error.status;
    context.requestPath =
      extractRequestPathFromProviderApiError(input.error) ?? config.defaultRequestPath;

    const sanitizedResponse = sanitizeProviderApiErrorResponseBody(input.error.responseBody);
    if (sanitizedResponse?.providerErrorCode !== undefined) {
      context.providerErrorCode = sanitizedResponse.providerErrorCode;
    }
    if (sanitizedResponse?.providerErrorMessage) {
      context.providerErrorMessage = sanitizedResponse.providerErrorMessage;
    }

    context.errorName = input.error.name;
    return context;
  }

  if (input.error instanceof Error) {
    context.errorName = input.error.name;
    context.errorType = input.error.constructor.name;
    context.requestPath =
      extractRequestPathFromProviderApiError(input.error) ?? config.defaultRequestPath;
    return context;
  }

  context.errorType = typeof input.error;
  return context;
}
