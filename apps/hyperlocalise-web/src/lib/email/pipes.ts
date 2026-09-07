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

import { type EmailProviderSlug, toEmailPipesProviderSlug } from "./constants";
import type { EmailPipesConnectionStatus, EmailPipesError } from "./types";

const PIPES_UNAVAILABLE: EmailPipesError = {
  code: "email_pipes_unavailable",
  message: "WorkOS is not configured, so email providers cannot connect through Pipes.",
};

const PROVIDER_NOT_CONNECTED: EmailPipesError = {
  code: "email_provider_not_connected",
  message: "Connect this email provider in Integrations before using it.",
};

const NEEDS_REAUTHORIZATION: EmailPipesError = {
  code: "email_pipes_needs_reauthorization",
  message: "Reconnect this email provider in Integrations, then try again.",
};

function mapPipesError(code: string): EmailPipesError {
  if (code === "pipes_not_connected") {
    return PROVIDER_NOT_CONNECTED;
  }
  if (code === "pipes_needs_reauthorization") {
    return NEEDS_REAUTHORIZATION;
  }
  return PIPES_UNAVAILABLE;
}

export async function resolveEmailPipesWorkosUserId(input: {
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

export async function getEmailPipesConnectionStatus(input: {
  provider: EmailProviderSlug;
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<EmailPipesConnectionStatus, EmailPipesError>> {
  const result = await getPipesAccountStatus({
    provider: toEmailPipesProviderSlug(input.provider),
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function loadEmailPipesApiKey(input: {
  provider: EmailProviderSlug;
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, EmailPipesError>> {
  const result = await loadPipesApiKey({
    provider: toEmailPipesProviderSlug(input.provider),
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}
