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

import { CUSTOMER_IO_PIPES_SLUG } from "./constants";
import type { CustomerIoPipesConnectionStatus, CustomerIoPipesError } from "./types";

const PIPES_UNAVAILABLE: CustomerIoPipesError = {
  code: "customer_io_pipes_unavailable",
  message: "WorkOS is not configured, so Customer.io cannot connect through Pipes.",
};

const NOT_CONNECTED: CustomerIoPipesError = {
  code: "customer_io_not_connected",
  message: "Connect Customer.io in Integrations before using it.",
};

const API_KEY_REQUIRED: CustomerIoPipesError = {
  code: "customer_io_api_key_required",
  message: "Paste a Customer.io App API key to connect.",
};

const NEEDS_REAUTHORIZATION: CustomerIoPipesError = {
  code: "customer_io_pipes_needs_reauthorization",
  message: "Reconnect Customer.io in Integrations, then try again.",
};

function mapPipesError(code: string): CustomerIoPipesError {
  if (code === "pipes_not_connected") {
    return NOT_CONNECTED;
  }
  if (code === "pipes_needs_reauthorization") {
    return NEEDS_REAUTHORIZATION;
  }
  return PIPES_UNAVAILABLE;
}

export async function resolveCustomerIoPipesWorkosUserId(input: {
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

export async function getCustomerIoPipesConnectionStatus(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<CustomerIoPipesConnectionStatus, CustomerIoPipesError>> {
  const result = await getPipesAccountStatus({
    provider: CUSTOMER_IO_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function loadCustomerIoPipesApiKey(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, CustomerIoPipesError>> {
  const result = await loadPipesApiKey({
    provider: CUSTOMER_IO_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function saveCustomerIoPipesApiKey(input: {
  localOrganizationId: string;
  workosUserId: string;
  apiKey: string;
}): Promise<Result<CustomerIoPipesConnectionStatus, CustomerIoPipesError>> {
  if (!input.apiKey.trim()) {
    return err(API_KEY_REQUIRED);
  }

  const result = await upsertPipesApiKey({
    provider: CUSTOMER_IO_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
    secret: input.apiKey,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}
