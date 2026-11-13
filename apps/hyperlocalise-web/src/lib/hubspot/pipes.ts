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
import { getPipesAccountStatus, loadPipesAccessToken } from "@/lib/pipes/accounts";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { HUBSPOT_PIPES_SLUG } from "./constants";
import type { HubspotPipesConnectionStatus, HubspotPipesError } from "./types";

const PIPES_UNAVAILABLE: HubspotPipesError = {
  code: "hubspot_pipes_unavailable",
  message: "WorkOS is not configured, so HubSpot cannot connect through Pipes.",
};

const HUBSPOT_NOT_CONNECTED: HubspotPipesError = {
  code: "hubspot_not_connected",
  message: "Connect HubSpot in Integrations before using it.",
};

const HUBSPOT_NEEDS_REAUTHORIZATION: HubspotPipesError = {
  code: "hubspot_pipes_needs_reauthorization",
  message: "Reconnect HubSpot in Integrations, then try again.",
};

function mapPipesError(code: string): HubspotPipesError {
  if (code === "pipes_not_connected") {
    return HUBSPOT_NOT_CONNECTED;
  }
  if (code === "pipes_needs_reauthorization") {
    return HUBSPOT_NEEDS_REAUTHORIZATION;
  }
  return PIPES_UNAVAILABLE;
}

export async function resolveHubspotPipesWorkosUserId(input: {
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

export async function getHubspotPipesConnectionStatus(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<HubspotPipesConnectionStatus, HubspotPipesError>> {
  const result = await getPipesAccountStatus({
    provider: HUBSPOT_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function loadHubspotPipesAccessToken(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, HubspotPipesError>> {
  const result = await loadPipesAccessToken({
    provider: HUBSPOT_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}
