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

import { err, ok, type Result } from "@/lib/primitives/result/results";
import { getWorkosServerClient } from "@/lib/workos/server-client";

import type { PipesProviderSlug } from "./providers";
import type { PipesStatusError } from "./types";

const PIPES_UNAVAILABLE: PipesStatusError = {
  code: "pipes_unavailable",
  message: "WorkOS is not configured, so this provider cannot connect through Pipes.",
};

export const PIPES_AUTH_METHOD_OAUTH = "oauth" as const;
export const PIPES_AUTH_METHOD_API_KEY = "api_key" as const;

export type PipesProviderAuthMethod =
  | typeof PIPES_AUTH_METHOD_OAUTH
  | typeof PIPES_AUTH_METHOD_API_KEY;

const DEFAULT_SUPPORTED_AUTH_METHODS: PipesProviderAuthMethod[] = [
  PIPES_AUTH_METHOD_OAUTH,
  PIPES_AUTH_METHOD_API_KEY,
];

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
    const list = await workos.pipes.listUserDataProviders({
      userId: context.workosUserId,
      organizationId: context.workosOrganizationId,
    });
    const providerEntry = list.data.find((entry) => entry.slug === provider);
    return normalizeSupportedAuthMethods(providerEntry?.authMethods);
  } catch {
    return [...DEFAULT_SUPPORTED_AUTH_METHODS];
  }
}

export async function getWorkosPipesProviderAvailability(
  provider: PipesProviderSlug,
  context?: GetWorkosPipesProviderAvailabilityContext,
): Promise<Result<PipesProviderAvailability, PipesStatusError>> {
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

  const supportedAuthMethods = await loadSupportedAuthMethods(workos, provider, context);

  try {
    const integration = await workos.pipes.getDataIntegration({ slug: provider });
    return ok({
      workosConfigured: true,
      providerConfigured: true,
      providerEnabled: Boolean(integration.enabled),
      supportedAuthMethods,
    });
  } catch (error) {
    if (isNotFound(error)) {
      return ok({
        workosConfigured: true,
        providerConfigured: false,
        providerEnabled: false,
        supportedAuthMethods,
      });
    }
    return err(PIPES_UNAVAILABLE);
  }
}

export function isPipesProviderConnectable(availability: PipesProviderAvailability): boolean {
  return (
    availability.workosConfigured && availability.providerConfigured && availability.providerEnabled
  );
}
