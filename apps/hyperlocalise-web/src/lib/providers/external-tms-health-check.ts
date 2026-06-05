import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import { parseSmartlingCredentials } from "./adapters/smartling/smartling-credentials";
import { classifySmartlingHttpError } from "./adapters/smartling/smartling-api";
import { resolvePhraseBaseUrl } from "./adapters/phrase/phrase-base-url";
import {
  OAUTH_AUTH_MODE,
  resolveExternalTmsSecretMaterial,
  type ExternalTmsCredential,
  type ExternalTmsProviderKind,
} from "./organization-external-tms-provider-credentials";
import { providerSafeFetch } from "./provider-safe-fetch";
import { normalizeProviderBaseUrl } from "./provider-url-safety";

export type ExternalTmsHealthStatus = "connected" | "degraded" | "error";
export type ExternalTmsAvailability = "available" | "unavailable" | "unknown";
export type ExternalTmsAuthValidity = "valid" | "invalid" | "unknown";

export type ExternalTmsRateLimitHints = {
  limit: string | null;
  remaining: string | null;
  resetAt: string | null;
  retryAfter: string | null;
};

export type ExternalTmsHealthCheckResult = {
  status: ExternalTmsHealthStatus;
  availability: ExternalTmsAvailability;
  authValidity: ExternalTmsAuthValidity;
  errorCode: string | null;
  message: string | null;
  rateLimit: ExternalTmsRateLimitHints;
  lastSuccessfulSyncAt: string | null;
};

export async function checkExternalTmsProviderHealth(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  credentialId?: string;
  fetchFn?: typeof fetch;
}): Promise<{
  credential: ExternalTmsCredential | null;
  health: ExternalTmsHealthCheckResult | null;
}> {
  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      input.credentialId
        ? and(
            eq(schema.organizationExternalTmsProviderCredentials.id, input.credentialId),
            eq(
              schema.organizationExternalTmsProviderCredentials.organizationId,
              input.organizationId,
            ),
            eq(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
          )
        : and(
            eq(
              schema.organizationExternalTmsProviderCredentials.organizationId,
              input.organizationId,
            ),
            eq(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
          ),
    )
    .limit(1);

  if (!credential) {
    return { credential: null, health: null };
  }

  if (credential.providerKind === "phrase" && credential.authMode === OAUTH_AUTH_MODE) {
    return {
      credential,
      health: {
        status: "error",
        availability: "unknown",
        authValidity: "unknown",
        errorCode: "phrase_user_connection_required",
        message: "Connect your Phrase account before checking Phrase health.",
        rateLimit: emptyRateLimitHints(),
        lastSuccessfulSyncAt: null,
      },
    };
  }

  if (credential.providerKind === "lokalise" && credential.authMode === OAUTH_AUTH_MODE) {
    return {
      credential,
      health: {
        status: "error",
        availability: "unknown",
        authValidity: "unknown",
        errorCode: "lokalise_user_connection_required",
        message: "Connect your Lokalise account before checking Lokalise health.",
        rateLimit: emptyRateLimitHints(),
        lastSuccessfulSyncAt: null,
      },
    };
  }

  const secretMaterial = await resolveExternalTmsSecretMaterial({
    credential,
    fetchFn: input.fetchFn,
  });
  const response = await validateExternalTmsCredential({
    providerKind: input.providerKind,
    secretMaterial,
    baseUrl: credential.baseUrl,
    region: credential.region,
    fetchFn: input.fetchFn ?? providerSafeFetch,
  });

  return {
    credential,
    health: {
      ...response,
      lastSuccessfulSyncAt: null,
    },
  };
}

export async function persistExternalTmsProviderHealth(input: {
  credentialId: string;
  health: ExternalTmsHealthCheckResult;
}) {
  const now = new Date();

  await db
    .update(schema.organizationExternalTmsProviderCredentials)
    .set({
      validationStatus: input.health.status,
      validationMessage: input.health.message,
      lastValidatedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.organizationExternalTmsProviderCredentials.id, input.credentialId));
}

async function validateExternalTmsCredential(input: {
  providerKind: ExternalTmsProviderKind;
  secretMaterial: string;
  baseUrl: string | null;
  region: string | null;
  fetchFn: typeof fetch;
}): Promise<Omit<ExternalTmsHealthCheckResult, "lastSuccessfulSyncAt">> {
  if (input.providerKind === "smartling") {
    try {
      parseSmartlingCredentials(input.secretMaterial);
    } catch {
      return {
        status: "error",
        availability: "unknown",
        authValidity: "unknown",
        errorCode: "smartling_credentials_invalid",
        message: "Smartling credentials must include a user identifier and user secret.",
        rateLimit: emptyRateLimitHints(),
      };
    }
  }

  const request = buildValidationRequest(input);
  if (!request) {
    return {
      status: "error",
      availability: "unknown",
      authValidity: "unknown",
      errorCode: "provider_base_url_invalid",
      message: "Provider base URL is invalid.",
      rateLimit: emptyRateLimitHints(),
    };
  }

  let response: Response;
  try {
    response = await input.fetchFn(request.url, request.init);
  } catch {
    return {
      status: "degraded",
      availability: "unavailable",
      authValidity: "unknown",
      errorCode: "provider_unavailable",
      message: "Provider health check failed.",
      rateLimit: emptyRateLimitHints(),
    };
  }
  const rateLimit = readRateLimitHints(response.headers);

  if (input.providerKind === "smartling") {
    const body = await readResponseBody(response);

    if (response.ok) {
      const smartlingHealth = parseSmartlingHealthFromBody(response.status, body);
      if (smartlingHealth) {
        return { ...smartlingHealth, rateLimit };
      }
    }

    const smartlingError = classifySmartlingHttpError(response.status, body);
    return {
      status: smartlingError.errorCode === "smartling_auth_invalid" ? "error" : "degraded",
      availability:
        smartlingError.errorCode === "smartling_unavailable" ? "unavailable" : "available",
      authValidity: smartlingError.errorCode === "smartling_auth_invalid" ? "invalid" : "unknown",
      errorCode: smartlingError.errorCode,
      message: smartlingError.message,
      rateLimit,
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      status: "error",
      availability: "available",
      authValidity: "invalid",
      errorCode: "provider_auth_invalid",
      message: "Provider rejected the stored credential.",
      rateLimit,
    };
  }

  if (response.status === 429) {
    return {
      status: "degraded",
      availability: "available",
      authValidity: "unknown",
      errorCode: "provider_rate_limited",
      message: "Provider health check was rate limited.",
      rateLimit,
    };
  }

  if (response.ok) {
    return {
      status: "connected",
      availability: "available",
      authValidity: "valid",
      errorCode: null,
      message: null,
      rateLimit,
    };
  }

  return {
    status: "degraded",
    availability: response.status >= 500 ? "unavailable" : "unknown",
    authValidity: "unknown",
    errorCode: "provider_health_check_failed",
    message: `Provider health check returned HTTP ${response.status}.`,
    rateLimit,
  };
}

function parseSmartlingHealthFromBody(
  status: number,
  body: unknown,
): Omit<ExternalTmsHealthCheckResult, "lastSuccessfulSyncAt" | "rateLimit"> | null {
  if (!body || typeof body !== "object") return null;

  const envelope = body as {
    response?: { code?: string; data?: { accessToken?: string } };
  };
  if (envelope.response?.code !== "SUCCESS" || !envelope.response.data?.accessToken) {
    const classified = classifySmartlingHttpError(status, body);
    return {
      status: classified.errorCode === "smartling_auth_invalid" ? "error" : "degraded",
      availability: "available",
      authValidity: classified.errorCode === "smartling_auth_invalid" ? "invalid" : "unknown",
      errorCode: classified.errorCode,
      message: classified.message,
    };
  }

  return {
    status: "connected",
    availability: "available",
    authValidity: "valid",
    errorCode: null,
    message: null,
  };
}

function buildValidationRequest(input: {
  providerKind: ExternalTmsProviderKind;
  secretMaterial: string;
  baseUrl: string | null;
  region: string | null;
}): { url: string; init: RequestInit } | null {
  if (input.providerKind === "crowdin") {
    const baseUrl = normalizeProviderBaseUrl(input.baseUrl, "https://api.crowdin.com");
    return {
      url: `${baseUrl}/api/v2/user`,
      init: { headers: { Authorization: `Bearer ${input.secretMaterial}` } },
    };
  }

  if (input.providerKind === "phrase") {
    const baseUrl = resolvePhraseBaseUrl({
      region: input.region,
      baseUrl: input.baseUrl,
    });
    return {
      url: `${baseUrl}/v2/user`,
      init: { headers: { Authorization: `token ${input.secretMaterial}` } },
    };
  }

  if (input.providerKind === "lokalise") {
    const baseUrl = normalizeProviderBaseUrl(input.baseUrl, "https://api.lokalise.com");
    return {
      url: `${baseUrl}/api2/projects?limit=1`,
      init: { headers: { "X-Api-Token": input.secretMaterial } },
    };
  }

  if (input.providerKind === "smartling") {
    const credentials = parseSmartlingCredentials(input.secretMaterial);
    const baseUrl = normalizeProviderBaseUrl(input.baseUrl, "https://api.smartling.com");
    return {
      url: `${baseUrl}/auth-api/v2/authenticate`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIdentifier: credentials.userIdentifier,
          userSecret: credentials.userSecret,
        }),
      },
    };
  }

  return null;
}

function readRateLimitHints(headers: Headers): ExternalTmsRateLimitHints {
  return {
    limit: headers.get("x-ratelimit-limit"),
    remaining: headers.get("x-ratelimit-remaining"),
    resetAt: headers.get("x-ratelimit-reset"),
    retryAfter: headers.get("retry-after"),
  };
}

function emptyRateLimitHints(): ExternalTmsRateLimitHints {
  return {
    limit: null,
    remaining: null,
    resetAt: null,
    retryAfter: null,
  };
}

async function readResponseBody(response: Response) {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}
