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

import { STORYBLOK_PIPES_SLUG } from "./constants";
import type { StoryblokPipesConnectionStatus, StoryblokPipesError } from "./types";

const PIPES_UNAVAILABLE: StoryblokPipesError = {
  code: "storyblok_pipes_unavailable",
  message: "Storyblok isn't available right now. Contact support if this continues.",
};

const STORYBLOK_NOT_CONNECTED: StoryblokPipesError = {
  code: "storyblok_not_connected",
  message: "Connect Storyblok in Integrations before using it.",
};

const STORYBLOK_NEEDS_REAUTHORIZATION: StoryblokPipesError = {
  code: "storyblok_pipes_needs_reauthorization",
  message: "Reconnect Storyblok in Integrations, then try again.",
};

const STORYBLOK_ACCESS_TOKEN_REQUIRED: StoryblokPipesError = {
  code: "storyblok_access_token_required",
  message: "Paste a Storyblok personal access token.",
};

function mapPipesError(code: string): StoryblokPipesError {
  if (code === "pipes_not_connected") {
    return STORYBLOK_NOT_CONNECTED;
  }
  if (code === "pipes_needs_reauthorization") {
    return STORYBLOK_NEEDS_REAUTHORIZATION;
  }
  return PIPES_UNAVAILABLE;
}

export async function resolveStoryblokPipesWorkosUserId(input: {
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

export async function getStoryblokPipesConnectionStatus(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<StoryblokPipesConnectionStatus, StoryblokPipesError>> {
  const result = await getPipesAccountStatus({
    provider: STORYBLOK_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function loadStoryblokPipesAccessToken(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, StoryblokPipesError>> {
  const result = await loadPipesApiKey({
    provider: STORYBLOK_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function saveStoryblokPipesAccessToken(input: {
  localOrganizationId: string;
  workosUserId: string;
  workosOrganizationId?: string | null;
  accessToken: string;
}): Promise<Result<StoryblokPipesConnectionStatus, StoryblokPipesError>> {
  if (!input.accessToken.trim()) {
    return err(STORYBLOK_ACCESS_TOKEN_REQUIRED);
  }

  const result = await upsertPipesApiKey({
    provider: STORYBLOK_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
    workosOrganizationId: input.workosOrganizationId,
    secret: input.accessToken,
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
