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
import { getPipesAccountStatus, loadPipesApiKey } from "@/lib/pipes/accounts";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { BRAZE_PIPES_SLUG } from "./constants";
import type { BrazePipesConnectionStatus, BrazePipesError } from "./types";

const PIPES_UNAVAILABLE: BrazePipesError = {
  code: "braze_pipes_unavailable",
  message: "WorkOS is not configured, so Braze cannot connect through Pipes.",
};

const BRAZE_NOT_CONNECTED: BrazePipesError = {
  code: "braze_not_connected",
  message: "Connect Braze in Integrations before using it.",
};

const BRAZE_NEEDS_REAUTHORIZATION: BrazePipesError = {
  code: "braze_pipes_needs_reauthorization",
  message: "Reconnect Braze in Integrations, then try again.",
};

function mapPipesError(code: string): BrazePipesError {
  if (code === "pipes_not_connected") {
    return BRAZE_NOT_CONNECTED;
  }
  if (code === "pipes_needs_reauthorization") {
    return BRAZE_NEEDS_REAUTHORIZATION;
  }
  return PIPES_UNAVAILABLE;
}

export async function resolveBrazePipesWorkosUserId(input: {
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

export async function getBrazePipesConnectionStatus(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<BrazePipesConnectionStatus, BrazePipesError>> {
  const result = await getPipesAccountStatus({
    provider: BRAZE_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function loadBrazePipesApiKey(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, BrazePipesError>> {
  const result = await loadPipesApiKey({
    provider: BRAZE_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}
