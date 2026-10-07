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
import type { DatabaseClient, DatabaseTransaction } from "@/lib/database/client";

import {
  IntercomSyncStaleConfigError,
  readLiveIntercomScopeKey,
  resolveIntercomAutomationFreshness,
  resolveIntercomAutomationScopeFreshness,
  type IntercomSyncStaleConfigCode,
} from "./intercom-sync-scope";

export async function assertLiveIntercomAutomationConfigVersion(
  client: DatabaseClient,
  input: {
    organizationId: string;
    automationId: string;
    configVersion: number;
    scopeKey: string;
    staleErrorCode: IntercomSyncStaleConfigCode;
    lock?: boolean;
    compare?: "config" | "scope";
  },
): Promise<void> {
  const query = client
    .select({
      configVersion: schema.workspaceAutomations.configVersion,
      projectId: schema.workspaceAutomations.projectId,
      toolConfig: schema.workspaceAutomations.toolConfig,
    })
    .from(schema.workspaceAutomations)
    .where(
      and(
        eq(schema.workspaceAutomations.id, input.automationId),
        eq(schema.workspaceAutomations.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  const [row] = input.lock ? await query.for("update") : await query;
  const liveScopeKey = row
    ? readLiveIntercomScopeKey({
        projectId: row.projectId,
        toolConfig: row.toolConfig,
      })
    : null;

  const freshness =
    input.compare === "scope"
      ? resolveIntercomAutomationScopeFreshness({
          snapshotScopeKey: input.scopeKey,
          liveScopeKey,
        })
      : resolveIntercomAutomationFreshness({
          snapshotConfigVersion: input.configVersion,
          snapshotScopeKey: input.scopeKey,
          liveConfigVersion: row?.configVersion ?? null,
          liveScopeKey,
        });

  if (freshness === "stale") {
    throw new IntercomSyncStaleConfigError(input.staleErrorCode);
  }
}

export async function withCurrentIntercomAutomationConfig<T>(
  input: {
    organizationId: string;
    automationId: string;
    configVersion: number;
    scopeKey: string;
    staleErrorCode: IntercomSyncStaleConfigCode;
    compare?: "config" | "scope";
  },
  write: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await assertLiveIntercomAutomationConfigVersion(tx, {
      ...input,
      lock: true,
    });
    return write(tx);
  });
}
