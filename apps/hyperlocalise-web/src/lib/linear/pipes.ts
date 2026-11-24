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

import { LINEAR_PIPES_SLUG } from "./constants";
import type { LinearPipesConnectionStatus, LinearPipesError } from "./types";

const PIPES_UNAVAILABLE: LinearPipesError = {
  code: "linear_pipes_unavailable",
  message: "WorkOS is not configured, so Linear cannot connect through Pipes.",
};

const LINEAR_NOT_CONNECTED: LinearPipesError = {
  code: "linear_not_connected",
  message: "Connect Linear in Integrations before using it.",
};

const LINEAR_NEEDS_REAUTHORIZATION: LinearPipesError = {
  code: "linear_pipes_needs_reauthorization",
  message: "Reconnect Linear in Integrations, then try again.",
};

function mapPipesError(code: string): LinearPipesError {
  if (code === "pipes_not_connected") {
    return LINEAR_NOT_CONNECTED;
  }
  if (code === "pipes_needs_reauthorization") {
    return LINEAR_NEEDS_REAUTHORIZATION;
  }
  return PIPES_UNAVAILABLE;
}

export async function resolveLinearPipesWorkosUserId(input: {
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

export async function getLinearPipesConnectionStatus(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<LinearPipesConnectionStatus, LinearPipesError>> {
  const result = await getPipesAccountStatus({
    provider: LINEAR_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function loadLinearPipesAccessToken(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, LinearPipesError>> {
  const result = await loadPipesAccessToken({
    provider: LINEAR_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}
