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

import { db, schema } from "@/lib/database/client";
import { getPipesAccountStatus, loadPipesApiKey, upsertPipesApiKey } from "@/lib/pipes/accounts";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { SANITY_PIPES_SLUG } from "./constants";
import type { SanityPipesConnectionStatus, SanityPipesError } from "./types";

const PIPES_UNAVAILABLE: SanityPipesError = {
  code: "sanity_pipes_unavailable",
  message: "WorkOS is not configured, so Sanity cannot connect through Pipes.",
};

const SANITY_NOT_CONNECTED: SanityPipesError = {
  code: "sanity_not_connected",
  message: "Connect Sanity in Integrations before using it.",
};

const SANITY_NEEDS_REAUTHORIZATION: SanityPipesError = {
  code: "sanity_pipes_needs_reauthorization",
  message: "Reconnect Sanity in Integrations, then try again.",
};

const SANITY_API_TOKEN_REQUIRED: SanityPipesError = {
  code: "sanity_api_token_required",
  message: "Paste a Sanity API token with Editor access or higher.",
};

function mapPipesError(code: string): SanityPipesError {
  if (code === "pipes_not_connected") {
    return SANITY_NOT_CONNECTED;
  }
  if (code === "pipes_needs_reauthorization") {
    return SANITY_NEEDS_REAUTHORIZATION;
  }
  return PIPES_UNAVAILABLE;
}

export async function resolveSanityPipesWorkosUserId(input: {
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

export async function getSanityPipesConnectionStatus(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<SanityPipesConnectionStatus, SanityPipesError>> {
  const result = await getPipesAccountStatus({
    provider: SANITY_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function loadSanityPipesAccessToken(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, SanityPipesError>> {
  const result = await loadPipesApiKey({
    provider: SANITY_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function saveSanityPipesApiToken(input: {
  localOrganizationId: string;
  workosUserId: string;
  apiToken: string;
}): Promise<Result<SanityPipesConnectionStatus, SanityPipesError>> {
  if (!input.apiToken.trim()) {
    return err(SANITY_API_TOKEN_REQUIRED);
  }

  const result = await upsertPipesApiKey({
    provider: SANITY_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
    secret: input.apiToken,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok({
    connected: result.value.connected,
    needsReauthorization: result.value.needsReauthorization,
  });
}
