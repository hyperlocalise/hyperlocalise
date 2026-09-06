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

import { AHREFS_PIPES_SLUG } from "./constants";
import type { AhrefsPipesConnectionStatus, AhrefsPipesError } from "./types";

const PIPES_UNAVAILABLE: AhrefsPipesError = {
  code: "ahrefs_pipes_unavailable",
  message: "WorkOS is not configured, so Ahrefs cannot connect through Pipes.",
};

const AHREFS_NOT_CONNECTED: AhrefsPipesError = {
  code: "ahrefs_not_connected",
  message: "Connect Ahrefs in Integrations before using it.",
};

const AHREFS_NEEDS_REAUTHORIZATION: AhrefsPipesError = {
  code: "ahrefs_pipes_needs_reauthorization",
  message: "Reconnect Ahrefs in Integrations, then try again.",
};

async function loadWorkosOrganizationId(
  localOrganizationId: string,
): Promise<Result<string, AhrefsPipesError>> {
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

export async function resolveAhrefsPipesWorkosUserId(input: {
  workosUserId?: string | null;
  localUserId?: string | null;
}): Promise<string | null> {
  const explicit = input.workosUserId?.trim();
  if (explicit) {
    return explicit;
  }

  if (!input.localUserId) {
    return null;
  }

  const [user] = await db
    .select({ workosUserId: schema.users.workosUserId })
    .from(schema.users)
    .where(eq(schema.users.id, input.localUserId))
    .limit(1);

  return user?.workosUserId ?? null;
}

function isNotFound(error: unknown): boolean {
  return error instanceof NotFoundException;
}

export async function getAhrefsPipesConnectionStatus(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<AhrefsPipesConnectionStatus, AhrefsPipesError>> {
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
      slug: AHREFS_PIPES_SLUG,
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

export async function loadAhrefsPipesApiKey(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, AhrefsPipesError>> {
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
      slug: AHREFS_PIPES_SLUG,
      userId: input.workosUserId,
      organizationId: organizationIdResult.value,
    });

    const apiKey = result.credential?.value?.trim();
    if (result.active === false || !apiKey) {
      if (result.error === "needs_reauthorization") {
        return err(AHREFS_NEEDS_REAUTHORIZATION);
      }
      return err(AHREFS_NOT_CONNECTED);
    }

    return ok(apiKey);
  } catch (error) {
    if (isNotFound(error)) {
      return err(AHREFS_NOT_CONNECTED);
    }

    return err(PIPES_UNAVAILABLE);
  }
}
