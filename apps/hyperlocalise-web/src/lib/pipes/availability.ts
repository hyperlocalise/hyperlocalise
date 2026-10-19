/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { NotFoundException } from "@workos-inc/node";

import { ok, type Result } from "@/lib/primitives/result/results";
import { getWorkosServerClient } from "@/lib/workos/server-client";

import type { PipesProviderSlug } from "./providers";
import type { PipesStatusError } from "./types";

export const PIPES_AUTH_METHOD_OAUTH = "oauth" as const;
export const PIPES_AUTH_METHOD_API_KEY = "api_key" as const;

export type PipesProviderAuthMethod =
  | typeof PIPES_AUTH_METHOD_OAUTH
  | typeof PIPES_AUTH_METHOD_API_KEY;

const DEFAULT_SUPPORTED_AUTH_METHODS: PipesProviderAuthMethod[] = [
  PIPES_AUTH_METHOD_OAUTH,
  PIPES_AUTH_METHOD_API_KEY,
];

const USER_DATA_PROVIDERS_TIMEOUT_MS = 2_500;
const AVAILABILITY_CACHE_TTL_MS = 60_000;

type CachedAvailability = {
  expiresAt: number;
  value: PipesProviderAvailability;
};

const availabilityCache = new Map<string, CachedAvailability>();

/** Test-only: clear cached WorkOS Pipes availability responses. */
export function resetPipesProviderAvailabilityCacheForTests() {
  availabilityCache.clear();
}

function availabilityCacheKey(
  provider: PipesProviderSlug,
  context: GetWorkosPipesProviderAvailabilityContext | undefined,
): string {
  if (!context) {
    return `${provider}:anonymous`;
  }
  return `${provider}:${context.workosOrganizationId}:${context.workosUserId}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export type PipesProviderAvailability = {
  workosConfigured: boolean;
  providerConfigured: boolean;
  providerEnabled: boolean;
  supportedAuthMethods: PipesProviderAuthMethod[];
};

export type GetWorkosPipesProviderAvailabilityContext = {
  workosUserId: string;
  workosOrganizationId: string;
};

function isPipesProviderAuthMethod(value: string): value is PipesProviderAuthMethod {
  return value === PIPES_AUTH_METHOD_OAUTH || value === PIPES_AUTH_METHOD_API_KEY;
}

function normalizeSupportedAuthMethods(
  authMethods: string[] | null | undefined,
): PipesProviderAuthMethod[] {
  if (!authMethods?.length) {
    return [...DEFAULT_SUPPORTED_AUTH_METHODS];
  }

  const normalized = authMethods.filter(isPipesProviderAuthMethod);
  return normalized.length > 0 ? normalized : [...DEFAULT_SUPPORTED_AUTH_METHODS];
}

export function supportsPipesOAuth(availability: PipesProviderAvailability): boolean {
  return availability.supportedAuthMethods?.includes(PIPES_AUTH_METHOD_OAUTH) ?? false;
}

export function supportsPipesApiKey(availability: PipesProviderAvailability): boolean {
  const methods = availability.supportedAuthMethods;
  if (!methods?.length) {
    return true;
  }
  return methods.includes(PIPES_AUTH_METHOD_API_KEY);
}

function isNotFound(error: unknown): boolean {
  return error instanceof NotFoundException;
}

export function isWorkosPipesConfigured(): boolean {
  return getWorkosServerClient() !== null;
}

async function loadSupportedAuthMethods(
  workos: NonNullable<ReturnType<typeof getWorkosServerClient>>,
  provider: PipesProviderSlug,
  context: GetWorkosPipesProviderAvailabilityContext | undefined,
): Promise<PipesProviderAuthMethod[]> {
  if (!context) {
    return [...DEFAULT_SUPPORTED_AUTH_METHODS];
  }

  try {
    const list = await withTimeout(
      workos.pipes.listUserDataProviders({
        userId: context.workosUserId,
        organizationId: context.workosOrganizationId,
      }),
      USER_DATA_PROVIDERS_TIMEOUT_MS,
      { object: "list" as const, data: [] },
    );
    const providerEntry = list.data.find((entry) => entry.slug === provider);
    return normalizeSupportedAuthMethods(providerEntry?.authMethods);
  } catch {
    return [...DEFAULT_SUPPORTED_AUTH_METHODS];
  }
}

function unavailableProviderAvailability(
  supportedAuthMethods: PipesProviderAuthMethod[],
): PipesProviderAvailability {
  return {
    workosConfigured: true,
    providerConfigured: false,
    providerEnabled: false,
    supportedAuthMethods,
  };
}

export async function getWorkosPipesProviderAvailability(
  provider: PipesProviderSlug,
  context?: GetWorkosPipesProviderAvailabilityContext,
): Promise<Result<PipesProviderAvailability, PipesStatusError>> {
  const cacheKey = availabilityCacheKey(provider, context);
  const cached = availabilityCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return ok(cached.value);
  }

  if (!isWorkosPipesConfigured()) {
    return ok({
      workosConfigured: false,
      providerConfigured: false,
      providerEnabled: false,
      supportedAuthMethods: [],
    });
  }

  const workos = getWorkosServerClient();
  if (!workos) {
    return ok({
      workosConfigured: false,
      providerConfigured: false,
      providerEnabled: false,
      supportedAuthMethods: [],
    });
  }

  const [supportedAuthMethods, integrationResult] = await Promise.all([
    loadSupportedAuthMethods(workos, provider, context),
    workos.pipes
      .getDataIntegration({ slug: provider })
      .then((integration) => ({ ok: true as const, integration }))
      .catch((error: unknown) => ({ ok: false as const, error })),
  ]);

  let availability: PipesProviderAvailability;
  if (integrationResult.ok) {
    availability = {
      workosConfigured: true,
      providerConfigured: true,
      providerEnabled: Boolean(integrationResult.integration.enabled),
      supportedAuthMethods,
    };
  } else if (isNotFound(integrationResult.error)) {
    availability = unavailableProviderAvailability(supportedAuthMethods);
  } else {
    availability = unavailableProviderAvailability(supportedAuthMethods);
  }

  availabilityCache.set(cacheKey, {
    expiresAt: Date.now() + AVAILABILITY_CACHE_TTL_MS,
    value: availability,
  });

  return ok(availability);
}

export function isPipesProviderConnectable(availability: PipesProviderAvailability): boolean {
  return (
    availability.workosConfigured && availability.providerConfigured && availability.providerEnabled
  );
}
