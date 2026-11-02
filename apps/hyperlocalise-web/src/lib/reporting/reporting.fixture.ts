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
import { db, schema } from "@/lib/database/client";

/**
 * Records when Reports started for a workspace, as its first capture does. Billing's rows count
 * in AI usage and AI spending only from then on, so tests that read them start Reports first;
 * the default is well before any day they use.
 */
export async function startReportingForTest(
  organizationId: string,
  at: Date = new Date("2026-01-01T00:00:00Z"),
) {
  await db
    .insert(schema.reportingWorkspaces)
    .values({ organizationId, startedAt: at })
    .onConflictDoUpdate({
      target: schema.reportingWorkspaces.organizationId,
      set: { startedAt: at },
    });
}
