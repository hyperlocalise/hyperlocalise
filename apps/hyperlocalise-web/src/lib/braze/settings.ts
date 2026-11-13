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
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import { isBrazeRestEndpoint, type BrazeRestEndpoint } from "./constants";
import type { BrazeConnectionSettings, BrazeSettingsError } from "./types";

const BRAZE_ENDPOINT_MISSING: BrazeSettingsError = {
  code: "braze_endpoint_missing",
  message: "Save a Braze REST cluster in Integrations before using it.",
};

const BRAZE_ENDPOINT_INVALID: BrazeSettingsError = {
  code: "braze_endpoint_invalid",
  message: "Choose a Braze REST cluster from the allowlisted instances.",
};

function settingsWhere(input: { localOrganizationId: string; workosUserId: string }) {
  return and(
    eq(schema.brazeConnectionSettings.organizationId, input.localOrganizationId),
    eq(schema.brazeConnectionSettings.workosUserId, input.workosUserId),
  );
}

export async function getBrazeConnectionSettings(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<BrazeConnectionSettings | null> {
  const [row] = await db
    .select({ restEndpoint: schema.brazeConnectionSettings.restEndpoint })
    .from(schema.brazeConnectionSettings)
    .where(settingsWhere(input))
    .limit(1);

  if (!row || !isBrazeRestEndpoint(row.restEndpoint)) {
    return null;
  }

  return { restEndpoint: row.restEndpoint };
}

export async function loadBrazeRestEndpoint(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<BrazeRestEndpoint, BrazeSettingsError>> {
  const settings = await getBrazeConnectionSettings(input);
  if (!settings) {
    return err(BRAZE_ENDPOINT_MISSING);
  }
  return ok(settings.restEndpoint);
}

export async function upsertBrazeConnectionSettings(input: {
  localOrganizationId: string;
  workosUserId: string;
  restEndpoint: string;
}): Promise<Result<BrazeConnectionSettings, BrazeSettingsError>> {
  if (!isBrazeRestEndpoint(input.restEndpoint)) {
    return err(BRAZE_ENDPOINT_INVALID);
  }

  await db
    .insert(schema.brazeConnectionSettings)
    .values({
      organizationId: input.localOrganizationId,
      workosUserId: input.workosUserId,
      restEndpoint: input.restEndpoint,
    })
    .onConflictDoUpdate({
      target: [
        schema.brazeConnectionSettings.organizationId,
        schema.brazeConnectionSettings.workosUserId,
      ],
      set: {
        restEndpoint: input.restEndpoint,
        updatedAt: new Date(),
      },
    });

  return ok({ restEndpoint: input.restEndpoint });
}

export async function deleteBrazeConnectionSettings(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<void> {
  await db.delete(schema.brazeConnectionSettings).where(settingsWhere(input));
}
