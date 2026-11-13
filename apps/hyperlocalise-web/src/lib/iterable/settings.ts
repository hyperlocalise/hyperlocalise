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

import { isIterableRegion, type IterableRegion } from "./constants";
import type { IterableConnectionSettings, IterableSettingsError } from "./types";

const REGION_MISSING: IterableSettingsError = {
  code: "iterable_region_missing",
  message: "Save an Iterable data center in Integrations before using it.",
};

const REGION_INVALID: IterableSettingsError = {
  code: "iterable_region_invalid",
  message: "Choose an Iterable data center (US or EU).",
};

function settingsWhere(input: { localOrganizationId: string; workosUserId: string }) {
  return and(
    eq(schema.iterableConnectionSettings.organizationId, input.localOrganizationId),
    eq(schema.iterableConnectionSettings.workosUserId, input.workosUserId),
  );
}

export async function getIterableConnectionSettings(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<IterableConnectionSettings | null> {
  const [row] = await db
    .select({ region: schema.iterableConnectionSettings.region })
    .from(schema.iterableConnectionSettings)
    .where(settingsWhere(input))
    .limit(1);

  if (!row || !isIterableRegion(row.region)) {
    return null;
  }

  return { region: row.region };
}

export async function loadIterableRegion(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<IterableRegion, IterableSettingsError>> {
  const settings = await getIterableConnectionSettings(input);
  if (!settings) {
    return err(REGION_MISSING);
  }
  return ok(settings.region);
}

export async function upsertIterableConnectionSettings(input: {
  localOrganizationId: string;
  workosUserId: string;
  region: string;
}): Promise<Result<IterableConnectionSettings, IterableSettingsError>> {
  if (!isIterableRegion(input.region)) {
    return err(REGION_INVALID);
  }

  await db
    .insert(schema.iterableConnectionSettings)
    .values({
      organizationId: input.localOrganizationId,
      workosUserId: input.workosUserId,
      region: input.region,
    })
    .onConflictDoUpdate({
      target: [
        schema.iterableConnectionSettings.organizationId,
        schema.iterableConnectionSettings.workosUserId,
      ],
      set: {
        region: input.region,
        updatedAt: new Date(),
      },
    });

  return ok({ region: input.region });
}

export async function deleteIterableConnectionSettings(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<void> {
  await db.delete(schema.iterableConnectionSettings).where(settingsWhere(input));
}
