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

import { isCustomerIoRegion, type CustomerIoRegion } from "./constants";
import type { CustomerIoConnectionSettings, CustomerIoSettingsError } from "./types";

const REGION_MISSING: CustomerIoSettingsError = {
  code: "customer_io_region_missing",
  message: "Save a Customer.io region in Integrations before using it.",
};

const REGION_INVALID: CustomerIoSettingsError = {
  code: "customer_io_region_invalid",
  message: "Choose a Customer.io region (US or EU).",
};

function settingsWhere(input: { localOrganizationId: string; workosUserId: string }) {
  return and(
    eq(schema.customerIoConnectionSettings.organizationId, input.localOrganizationId),
    eq(schema.customerIoConnectionSettings.workosUserId, input.workosUserId),
  );
}

export async function getCustomerIoConnectionSettings(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<CustomerIoConnectionSettings | null> {
  const [row] = await db
    .select({ region: schema.customerIoConnectionSettings.region })
    .from(schema.customerIoConnectionSettings)
    .where(settingsWhere(input))
    .limit(1);

  if (!row || !isCustomerIoRegion(row.region)) {
    return null;
  }

  return { region: row.region };
}

export async function loadCustomerIoRegion(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<CustomerIoRegion, CustomerIoSettingsError>> {
  const settings = await getCustomerIoConnectionSettings(input);
  if (!settings) {
    return err(REGION_MISSING);
  }
  return ok(settings.region);
}

export async function upsertCustomerIoConnectionSettings(input: {
  localOrganizationId: string;
  workosUserId: string;
  region: string;
}): Promise<Result<CustomerIoConnectionSettings, CustomerIoSettingsError>> {
  if (!isCustomerIoRegion(input.region)) {
    return err(REGION_INVALID);
  }

  await db
    .insert(schema.customerIoConnectionSettings)
    .values({
      organizationId: input.localOrganizationId,
      workosUserId: input.workosUserId,
      region: input.region,
    })
    .onConflictDoUpdate({
      target: [
        schema.customerIoConnectionSettings.organizationId,
        schema.customerIoConnectionSettings.workosUserId,
      ],
      set: {
        region: input.region,
        updatedAt: new Date(),
      },
    });

  return ok({ region: input.region });
}

export async function deleteCustomerIoConnectionSettings(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<void> {
  await db.delete(schema.customerIoConnectionSettings).where(settingsWhere(input));
}
