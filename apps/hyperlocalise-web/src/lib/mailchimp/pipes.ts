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

import { MAILCHIMP_PIPES_SLUG } from "./constants";
import type { MailchimpPipesConnectionStatus, MailchimpPipesError } from "./types";

const PIPES_UNAVAILABLE: MailchimpPipesError = {
  code: "mailchimp_pipes_unavailable",
  message: "WorkOS is not configured, so Mailchimp cannot connect through Pipes.",
};

const MAILCHIMP_NOT_CONNECTED: MailchimpPipesError = {
  code: "mailchimp_not_connected",
  message: "Connect Mailchimp in Integrations before using it.",
};

const MAILCHIMP_NEEDS_REAUTHORIZATION: MailchimpPipesError = {
  code: "mailchimp_pipes_needs_reauthorization",
  message: "Reconnect Mailchimp in Integrations, then try again.",
};

function mapPipesError(code: string): MailchimpPipesError {
  if (code === "pipes_not_connected") {
    return MAILCHIMP_NOT_CONNECTED;
  }
  if (code === "pipes_needs_reauthorization") {
    return MAILCHIMP_NEEDS_REAUTHORIZATION;
  }
  return PIPES_UNAVAILABLE;
}

export async function resolveMailchimpPipesWorkosUserId(input: {
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

export async function getMailchimpPipesConnectionStatus(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<MailchimpPipesConnectionStatus, MailchimpPipesError>> {
  const result = await getPipesAccountStatus({
    provider: MAILCHIMP_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function loadMailchimpPipesAccessToken(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, MailchimpPipesError>> {
  const result = await loadPipesAccessToken({
    provider: MAILCHIMP_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}
