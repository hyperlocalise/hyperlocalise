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

import { LOOPS_PIPES_SLUG } from "./constants";
import type { LoopsPipesConnectionStatus, LoopsPipesError } from "./types";

const PIPES_UNAVAILABLE: LoopsPipesError = {
  code: "loops_pipes_unavailable",
  message: "WorkOS is not configured, so Loops cannot connect through Pipes.",
};

const LOOPS_NOT_CONNECTED: LoopsPipesError = {
  code: "loops_not_connected",
  message: "Connect Loops in Integrations before using it.",
};

const LOOPS_API_KEY_REQUIRED: LoopsPipesError = {
  code: "loops_api_key_required",
  message: "Paste a Loops API key to connect.",
};

const LOOPS_NEEDS_REAUTHORIZATION: LoopsPipesError = {
  code: "loops_pipes_needs_reauthorization",
  message: "Reconnect Loops in Integrations, then try again.",
};

function mapPipesError(code: string): LoopsPipesError {
  if (code === "pipes_not_connected") {
    return LOOPS_NOT_CONNECTED;
  }
  if (code === "pipes_needs_reauthorization") {
    return LOOPS_NEEDS_REAUTHORIZATION;
  }
  return PIPES_UNAVAILABLE;
}

export async function resolveLoopsPipesWorkosUserId(input: {
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

export async function getLoopsPipesConnectionStatus(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<LoopsPipesConnectionStatus, LoopsPipesError>> {
  const result = await getPipesAccountStatus({
    provider: LOOPS_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function loadLoopsPipesApiKey(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, LoopsPipesError>> {
  const result = await loadPipesApiKey({
    provider: LOOPS_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function saveLoopsPipesApiKey(input: {
  localOrganizationId: string;
  workosUserId: string;
  apiKey: string;
}): Promise<Result<LoopsPipesConnectionStatus, LoopsPipesError>> {
  if (!input.apiKey.trim()) {
    return err(LOOPS_API_KEY_REQUIRED);
  }

  const result = await upsertPipesApiKey({
    provider: LOOPS_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
    secret: input.apiKey,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}
