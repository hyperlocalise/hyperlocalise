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

import { ITERABLE_PIPES_SLUG } from "./constants";
import type { IterablePipesConnectionStatus, IterablePipesError } from "./types";

const PIPES_UNAVAILABLE: IterablePipesError = {
  code: "iterable_pipes_unavailable",
  message: "WorkOS is not configured, so Iterable cannot connect through Pipes.",
};

const NOT_CONNECTED: IterablePipesError = {
  code: "iterable_not_connected",
  message: "Connect Iterable in Integrations before using it.",
};

const API_KEY_REQUIRED: IterablePipesError = {
  code: "iterable_api_key_required",
  message: "Paste an Iterable server-side API key to connect.",
};

const NEEDS_REAUTHORIZATION: IterablePipesError = {
  code: "iterable_pipes_needs_reauthorization",
  message: "Reconnect Iterable in Integrations, then try again.",
};

const PIPES_PROVIDER_MISSING: IterablePipesError = {
  code: "iterable_pipes_provider_missing",
  message:
    "WorkOS Pipes does not have the Iterable provider yet. Enable it in the WorkOS Dashboard, then save again.",
};

function mapPipesError(code: string): IterablePipesError {
  if (code === "pipes_not_connected") {
    return NOT_CONNECTED;
  }
  if (code === "pipes_needs_reauthorization") {
    return NEEDS_REAUTHORIZATION;
  }
  return PIPES_UNAVAILABLE;
}

export async function resolveIterablePipesWorkosUserId(input: {
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

export async function getIterablePipesConnectionStatus(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<IterablePipesConnectionStatus, IterablePipesError>> {
  const result = await getPipesAccountStatus({
    provider: ITERABLE_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function loadIterablePipesApiKey(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, IterablePipesError>> {
  const result = await loadPipesApiKey({
    provider: ITERABLE_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function saveIterablePipesApiKey(input: {
  localOrganizationId: string;
  workosUserId: string;
  apiKey: string;
}): Promise<Result<IterablePipesConnectionStatus, IterablePipesError>> {
  if (!input.apiKey.trim()) {
    return err(API_KEY_REQUIRED);
  }

  const result = await upsertPipesApiKey({
    provider: ITERABLE_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
    secret: input.apiKey,
  });
  if (isErr(result)) {
    if (result.error.code === "pipes_not_connected") {
      return err(PIPES_PROVIDER_MISSING);
    }
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}
