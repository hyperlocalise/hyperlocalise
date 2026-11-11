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
  SanitySyncStaleConfigError,
  readLiveSanityOverwriteDrafts,
  readLiveSanityScopeKey,
  resolveSanityAutomationFreshness,
  resolveSanityAutomationScopeFreshness,
  type SanitySyncStaleConfigCode,
} from "./sanity-sync-scope";

export async function assertLiveSanityAutomationConfigVersion(
  client: DatabaseClient,
  input: {
    organizationId: string;
    automationId: string;
    configVersion: number;
    scopeKey: string;
    staleErrorCode: SanitySyncStaleConfigCode;
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
    ? readLiveSanityScopeKey({
        projectId: row.projectId,
        toolConfig: row.toolConfig,
      })
    : null;

  const freshness =
    input.compare === "scope"
      ? resolveSanityAutomationScopeFreshness({
          snapshotScopeKey: input.scopeKey,
          liveScopeKey,
        })
      : resolveSanityAutomationFreshness({
          snapshotConfigVersion: input.configVersion,
          snapshotScopeKey: input.scopeKey,
          liveConfigVersion: row?.configVersion ?? null,
          liveScopeKey,
        });

  if (freshness === "stale") {
    throw new SanitySyncStaleConfigError(input.staleErrorCode);
  }
}

export async function loadLiveSanityPushSettings(
  client: DatabaseClient,
  input: {
    organizationId: string;
    automationId: string;
    scopeKey: string;
    staleErrorCode: SanitySyncStaleConfigCode;
  },
): Promise<{ overwriteSanityDrafts: boolean }> {
  const [row] = await client
    .select({
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

  const liveScopeKey = row
    ? readLiveSanityScopeKey({
        projectId: row.projectId,
        toolConfig: row.toolConfig,
      })
    : null;
  if (
    resolveSanityAutomationScopeFreshness({
      snapshotScopeKey: input.scopeKey,
      liveScopeKey,
    }) === "stale"
  ) {
    throw new SanitySyncStaleConfigError(input.staleErrorCode);
  }

  return {
    overwriteSanityDrafts: readLiveSanityOverwriteDrafts(row?.toolConfig) ?? false,
  };
}

export async function withCurrentSanityAutomationConfig<T>(
  input: {
    organizationId: string;
    automationId: string;
    configVersion: number;
    scopeKey: string;
    staleErrorCode: SanitySyncStaleConfigCode;
    compare?: "config" | "scope";
  },
  write: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await assertLiveSanityAutomationConfigVersion(tx, {
      ...input,
      lock: true,
    });
    return write(tx);
  });
}
