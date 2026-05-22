import { and, desc, eq, ne } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { decryptProviderCredential } from "@/lib/security/provider-credential-crypto";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

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

type ExternalTmsCredential = typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;

export async function checkExternalTmsProviderHealth(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  fetchFn?: typeof fetch;
}): Promise<{
  credential: ExternalTmsCredential | null;
  health: ExternalTmsHealthCheckResult | null;
}> {
  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
      ),
    )
    .limit(1);

  if (!credential) {
    return { credential: null, health: null };
  }

  const lastSuccessfulSyncAt = await getLastSuccessfulSyncAt({
    organizationId: input.organizationId,
    providerKind: input.providerKind,
  });
  const secretMaterial = decryptProviderCredential({
    algorithm: credential.encryptionAlgorithm,
    keyVersion: credential.keyVersion,
    ciphertext: credential.ciphertext,
    iv: credential.iv,
    authTag: credential.authTag,
  });
  const response = await validateExternalTmsCredential({
    providerKind: input.providerKind,
    secretMaterial,
    baseUrl: credential.baseUrl,
    fetchFn: input.fetchFn ?? fetch,
  });

  return {
    credential,
    health: {
      ...response,
      lastSuccessfulSyncAt,
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

async function getLastSuccessfulSyncAt(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
}) {
  const [run] = await db
    .select({ completedAt: schema.providerSyncRuns.completedAt })
    .from(schema.providerSyncRuns)
    .where(
      and(
        eq(schema.providerSyncRuns.organizationId, input.organizationId),
        eq(schema.providerSyncRuns.providerKind, input.providerKind),
        eq(schema.providerSyncRuns.status, "succeeded"),
        ne(schema.providerSyncRuns.kind, "health_check"),
      ),
    )
    .orderBy(desc(schema.providerSyncRuns.completedAt))
    .limit(1);

  return run?.completedAt?.toISOString() ?? null;
}

async function validateExternalTmsCredential(input: {
  providerKind: ExternalTmsProviderKind;
  secretMaterial: string;
  baseUrl: string | null;
  fetchFn: typeof fetch;
}): Promise<Omit<ExternalTmsHealthCheckResult, "lastSuccessfulSyncAt">> {
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

function buildValidationRequest(input: {
  providerKind: ExternalTmsProviderKind;
  secretMaterial: string;
  baseUrl: string | null;
}): { url: string; init: RequestInit } | null {
  switch (input.providerKind) {
    case "crowdin": {
      const baseUrl = normalizeBaseUrl(input.baseUrl, "https://api.crowdin.com/api/v2");
      if (!baseUrl) return null;
      return {
        url: `${baseUrl}/user`,
        init: { headers: { Authorization: `Bearer ${input.secretMaterial}` } },
      };
    }
    case "phrase": {
      const baseUrl = normalizeBaseUrl(input.baseUrl, "https://api.phrase.com/v2");
      if (!baseUrl) return null;
      return {
        url: `${baseUrl}/user`,
        init: { headers: { Authorization: `token ${input.secretMaterial}` } },
      };
    }
    case "lokalise": {
      const baseUrl = normalizeBaseUrl(input.baseUrl, "https://api.lokalise.com/api2");
      if (!baseUrl) return null;
      return {
        url: `${baseUrl}/me`,
        init: { headers: { "X-Api-Token": input.secretMaterial } },
      };
    }
    case "smartling": {
      const credentials = parseSmartlingCredentials(input.secretMaterial);
      const baseUrl = normalizeBaseUrl(input.baseUrl, "https://api.smartling.com/auth-api/v2");
      if (!baseUrl) return null;
      return {
        url: `${baseUrl}/authenticate`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        },
      };
    }
  }
}

function normalizeBaseUrl(baseUrl: string | null, defaultBaseUrl: string) {
  try {
    const url = new URL(baseUrl ?? defaultBaseUrl);
    if (!isAllowedProviderBaseUrl(url)) return null;
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function isAllowedProviderBaseUrl(url: URL) {
  if (url.protocol !== "https:") return false;

  const hostname = url.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) return false;
  if (!hostname.includes(".") && !hostname.includes(":")) return false;

  if (isBlockedIpv4Address(hostname) || isBlockedIpv6Address(hostname)) return false;

  return true;
}

function isBlockedIpv4Address(hostname: string) {
  const octets = hostname.split(".");
  if (octets.length !== 4) return false;

  const bytes = octets.map((octet) => Number(octet));
  if (
    bytes.some(
      (byte, index) => !Number.isInteger(byte) || byte < 0 || byte > 255 || octets[index] === "",
    )
  ) {
    return false;
  }

  const [first, second] = bytes as [number, number, number, number];
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  );
}

function isBlockedIpv6Address(hostname: string) {
  if (!hostname.includes(":")) return false;

  if (
    hostname === "::1" ||
    hostname.startsWith("fe80:") ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd")
  ) {
    return true;
  }

  if (hostname.startsWith("::ffff:")) {
    const ipv4 = hostname.slice("::ffff:".length);
    return isBlockedIpv4Address(ipv4);
  }

  return false;
}

function parseSmartlingCredentials(secretMaterial: string) {
  try {
    const parsed = JSON.parse(secretMaterial) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "userIdentifier" in parsed &&
      "userSecret" in parsed
    ) {
      return parsed;
    }
  } catch {
    // Fall through to the compact `userIdentifier:userSecret` form.
  }

  const [userIdentifier, ...secretParts] = secretMaterial.split(":");
  return { userIdentifier, userSecret: secretParts.join(":") };
}

function readRateLimitHints(headers: Headers): ExternalTmsRateLimitHints {
  return {
    limit: firstHeader(headers, ["x-ratelimit-limit", "ratelimit-limit"]),
    remaining: firstHeader(headers, ["x-ratelimit-remaining", "ratelimit-remaining"]),
    resetAt: firstHeader(headers, ["x-ratelimit-reset", "ratelimit-reset"]),
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

function firstHeader(headers: Headers, names: string[]) {
  for (const name of names) {
    const value = headers.get(name);
    if (value) return value;
  }

  return null;
}
