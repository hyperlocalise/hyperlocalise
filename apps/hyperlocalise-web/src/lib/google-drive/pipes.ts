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

import { GOOGLE_DRIVE_PIPES_SLUG } from "./constants";
import type { GoogleDrivePipesError } from "./types";

const PIPES_UNAVAILABLE: GoogleDrivePipesError = {
  code: "google_drive_pipes_unavailable",
  message: "WorkOS is not configured, so Google Drive cannot connect through Pipes.",
};

const NOT_CONNECTED: GoogleDrivePipesError = {
  code: "google_drive_not_connected",
  message: "Connect Google Drive in Integrations before using it.",
};

const NEEDS_REAUTHORIZATION: GoogleDrivePipesError = {
  code: "google_drive_pipes_needs_reauthorization",
  message: "Reconnect Google Drive in Integrations, then try again.",
};

function mapPipesError(code: string): GoogleDrivePipesError {
  if (code === "pipes_not_connected") {
    return NOT_CONNECTED;
  }
  if (code === "pipes_needs_reauthorization") {
    return NEEDS_REAUTHORIZATION;
  }
  return PIPES_UNAVAILABLE;
}

export async function resolveGoogleDrivePipesWorkosUserId(input: {
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

export async function loadGoogleDrivePipesAccessToken(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, GoogleDrivePipesError>> {
  const result = await loadPipesAccessToken({
    provider: GOOGLE_DRIVE_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function getGoogleDrivePipesConnectionStatus(input: {
  localOrganizationId: string;
  workosUserId: string;
}) {
  return getPipesAccountStatus({
    provider: GOOGLE_DRIVE_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
}
