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

import { INTERCOM_PIPES_SLUG } from "./constants";
import type { IntercomPipesConnectionStatus, IntercomPipesError } from "./types";

const PIPES_UNAVAILABLE: IntercomPipesError = {
  code: "intercom_pipes_unavailable",
  message: "WorkOS is not configured, so Intercom cannot connect through Pipes.",
};

const INTERCOM_NOT_CONNECTED: IntercomPipesError = {
  code: "intercom_not_connected",
  message: "Connect Intercom in Integrations before using it.",
};

const INTERCOM_NEEDS_REAUTHORIZATION: IntercomPipesError = {
  code: "intercom_pipes_needs_reauthorization",
  message: "Reconnect Intercom in Integrations, then try again.",
};

function mapPipesError(code: string): IntercomPipesError {
  if (code === "pipes_not_connected") {
    return INTERCOM_NOT_CONNECTED;
  }
  if (code === "pipes_needs_reauthorization") {
    return INTERCOM_NEEDS_REAUTHORIZATION;
  }
  return PIPES_UNAVAILABLE;
}

export async function resolveIntercomPipesWorkosUserId(input: {
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

export async function getIntercomPipesConnectionStatus(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<IntercomPipesConnectionStatus, IntercomPipesError>> {
  const result = await getPipesAccountStatus({
    provider: INTERCOM_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function loadIntercomPipesAccessToken(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, IntercomPipesError>> {
  const result = await loadPipesApiKey({
    provider: INTERCOM_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}
