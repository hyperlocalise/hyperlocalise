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
import { eq } from "drizzle-orm";
import { NotFoundException } from "@workos-inc/node";

import { db, schema } from "@/lib/database/client";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { getWorkosServerClient } from "@/lib/workos/server-client";

import type { PipesProviderSlug } from "./providers";
import type { PipesConnectionStatus, PipesCredentialError, PipesStatusError } from "./types";

const PIPES_UNAVAILABLE: PipesStatusError = {
  code: "pipes_unavailable",
  message: "WorkOS is not configured, so this provider cannot connect through Pipes.",
};

const PIPES_NOT_CONNECTED: PipesCredentialError = {
  code: "pipes_not_connected",
  message: "Connect this provider in Integrations before using it.",
};

const PIPES_NEEDS_REAUTHORIZATION: PipesCredentialError = {
  code: "pipes_needs_reauthorization",
  message: "Reconnect this provider in Integrations, then try again.",
};

async function loadWorkosOrganizationId(
  localOrganizationId: string,
): Promise<Result<string, PipesStatusError>> {
  const [organization] = await db
    .select({ workosOrganizationId: schema.organizations.workosOrganizationId })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, localOrganizationId))
    .limit(1);

  if (!organization?.workosOrganizationId) {
    return err(PIPES_UNAVAILABLE);
  }

  return ok(organization.workosOrganizationId);
}

function isNotFound(error: unknown): boolean {
  return error instanceof NotFoundException;
}

export async function getPipesAccountStatus(input: {
  provider: PipesProviderSlug;
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<PipesConnectionStatus, PipesStatusError>> {
  const workos = getWorkosServerClient();
  if (!workos) {
    return err(PIPES_UNAVAILABLE);
  }

  const organizationIdResult = await loadWorkosOrganizationId(input.localOrganizationId);
  if (isErr(organizationIdResult)) {
    return organizationIdResult;
  }

  try {
    const account = await workos.pipes.getUserConnectedAccount({
      slug: input.provider,
      userId: input.workosUserId,
      organizationId: organizationIdResult.value,
    });

    if (account.state === "needs_reauthorization") {
      return ok({
        connected: false,
        needsReauthorization: true,
        apiKeyLast4: account.apiKeyLast4 ?? null,
      });
    }

    if (account.state !== "connected") {
      return ok({
        connected: false,
        needsReauthorization: false,
        apiKeyLast4: account.apiKeyLast4 ?? null,
      });
    }

    return ok({
      connected: true,
      needsReauthorization: false,
      apiKeyLast4: account.apiKeyLast4 ?? null,
    });
  } catch (error) {
    if (isNotFound(error)) {
      return ok({
        connected: false,
        needsReauthorization: false,
        apiKeyLast4: null,
      });
    }

    return err(PIPES_UNAVAILABLE);
  }
}

export async function loadPipesApiKey(input: {
  provider: PipesProviderSlug;
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, PipesCredentialError>> {
  const workos = getWorkosServerClient();
  if (!workos) {
    return err(PIPES_UNAVAILABLE);
  }

  const organizationIdResult = await loadWorkosOrganizationId(input.localOrganizationId);
  if (isErr(organizationIdResult)) {
    return organizationIdResult;
  }

  try {
    const result = await workos.pipes.createDataIntegrationCredential({
      slug: input.provider,
      userId: input.workosUserId,
      organizationId: organizationIdResult.value,
    });

    const apiKey = result.credential?.value?.trim();
    if (!apiKey || result.error) {
      if (result.error === "needs_reauthorization") {
        return err(PIPES_NEEDS_REAUTHORIZATION);
      }
      return err(PIPES_NOT_CONNECTED);
    }

    return ok(apiKey);
  } catch (error) {
    if (isNotFound(error)) {
      return err(PIPES_NOT_CONNECTED);
    }

    return err(PIPES_UNAVAILABLE);
  }
}
