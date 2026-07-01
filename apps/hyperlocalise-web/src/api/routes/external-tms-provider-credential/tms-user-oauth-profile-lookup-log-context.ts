import { LOKALISE_DEFAULT_BASE_URL } from "@/lib/providers/adapters/lokalise/lokalise-api";
import {
  PHRASE_TMS_DEFAULT_BASE_URL,
  resolvePhraseTmsBaseUrl,
} from "@/lib/providers/adapters/phrase/phrase-tms-base-url";
import { requireProviderBaseUrl } from "@/lib/providers/provider-url-safety";

const CROWDIN_DEFAULT_BASE_URL = "https://api.crowdin.com/api/v2";

const PROVIDER_API_PATH_PATTERN = / returned HTTP \d+ for (.+)$/;

export type TmsUserOAuthProfileLookupProvider = "crowdin" | "phrase" | "lokalise";

type ProviderOAuthProfileLookupConfig = {
  defaultBaseUrl: string;
  defaultRequestPath: string;
  resolveBaseUrl: (baseUrl?: string | null) => string;
};

const PROVIDER_OAUTH_PROFILE_LOOKUP_CONFIG: Record<
  TmsUserOAuthProfileLookupProvider,
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
  provider: TmsUserOAuthProfileLookupProvider;
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

export function extractRequestPathFromProviderApiError(error: Error): string | null {
  const match = error.message.match(PROVIDER_API_PATH_PATTERN);
  return match?.[1] ?? null;
}

function resolveApiHostname(baseUrl: string): string {
  return new URL(baseUrl).hostname;
}

export function buildTmsUserOAuthProfileLookupLogContext(input: {
  provider: TmsUserOAuthProfileLookupProvider;
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
