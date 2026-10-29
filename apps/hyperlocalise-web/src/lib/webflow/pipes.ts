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

import { WEBFLOW_PIPES_SLUG } from "./constants";
import type { WebflowPipesConnectionStatus, WebflowPipesError } from "./types";

const PIPES_UNAVAILABLE: WebflowPipesError = {
  code: "webflow_pipes_unavailable",
  message: "WorkOS is not configured, so Webflow cannot connect through Pipes.",
};

const WEBFLOW_NOT_CONNECTED: WebflowPipesError = {
  code: "webflow_not_connected",
  message: "Connect Webflow in Integrations before using it.",
};

const WEBFLOW_NEEDS_REAUTHORIZATION: WebflowPipesError = {
  code: "webflow_pipes_needs_reauthorization",
  message: "Reconnect Webflow in Integrations, then try again.",
};

const WEBFLOW_SITE_TOKEN_REQUIRED: WebflowPipesError = {
  code: "webflow_site_token_required",
  message: "Paste a Webflow site API token with the required scopes.",
};

function mapPipesError(code: string): WebflowPipesError {
  if (code === "pipes_not_connected") {
    return WEBFLOW_NOT_CONNECTED;
  }
  if (code === "pipes_needs_reauthorization") {
    return WEBFLOW_NEEDS_REAUTHORIZATION;
  }
  return PIPES_UNAVAILABLE;
}

export async function resolveWebflowPipesWorkosUserId(input: {
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

export async function getWebflowPipesConnectionStatus(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<WebflowPipesConnectionStatus, WebflowPipesError>> {
  const result = await getPipesAccountStatus({
    provider: WEBFLOW_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function loadWebflowPipesAccessToken(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, WebflowPipesError>> {
  const result = await loadPipesApiKey({
    provider: WEBFLOW_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function saveWebflowPipesSiteToken(input: {
  localOrganizationId: string;
  workosUserId: string;
  workosOrganizationId?: string | null;
  siteToken: string;
}): Promise<Result<WebflowPipesConnectionStatus, WebflowPipesError>> {
  if (!input.siteToken.trim()) {
    return err(WEBFLOW_SITE_TOKEN_REQUIRED);
  }

  const result = await upsertPipesApiKey({
    provider: WEBFLOW_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
    workosOrganizationId: input.workosOrganizationId,
    secret: input.siteToken,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok({
    connected: result.value.connected,
    needsReauthorization: result.value.needsReauthorization,
    apiKeyLast4: result.value.apiKeyLast4,
  });
}
