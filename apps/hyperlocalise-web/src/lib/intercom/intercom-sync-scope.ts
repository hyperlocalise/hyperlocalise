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
import { articleBelongsToCollections } from "./articles-api";

const INTERCOM_IMPORT_SCOPE_PREFIX = "scope:";

export const INTERCOM_IMPORT_STALE_CONFIG = "intercom_import_stale_config";
export const INTERCOM_PUSH_STALE_CONFIG = "intercom_push_stale_config";

export type IntercomSyncStaleConfigCode =
  | typeof INTERCOM_IMPORT_STALE_CONFIG
  | typeof INTERCOM_PUSH_STALE_CONFIG;

export class IntercomSyncStaleConfigError extends Error {
  readonly code: IntercomSyncStaleConfigCode;

  constructor(code: IntercomSyncStaleConfigCode) {
    super(code);
    this.name = "IntercomSyncStaleConfigError";
    this.code = code;
  }
}

export function isIntercomSyncStaleConfigError(
  error: unknown,
): error is IntercomSyncStaleConfigError {
  return error instanceof IntercomSyncStaleConfigError;
}

export function resolveIntercomAutomationFreshness(input: {
  snapshotConfigVersion: number;
  snapshotScopeKey: string;
  liveConfigVersion: number | null;
  liveScopeKey: string | null;
}): "current" | "stale" {
  if (input.liveConfigVersion == null || input.liveScopeKey == null) {
    return "stale";
  }
  if (input.liveConfigVersion !== input.snapshotConfigVersion) {
    return "stale";
  }
  if (input.liveScopeKey !== input.snapshotScopeKey) {
    return "stale";
  }
  return "current";
}

export function resolveIntercomAutomationScopeFreshness(input: {
  snapshotScopeKey: string;
  liveScopeKey: string | null;
}): "current" | "stale" {
  if (input.liveScopeKey == null || input.liveScopeKey !== input.snapshotScopeKey) {
    return "stale";
  }
  return "current";
}

export function readLiveIntercomScopeKey(input: {
  projectId: string | null;
  toolConfig: Record<string, unknown> | null | undefined;
}): string | null {
  const projectId = input.projectId?.trim();
  if (!projectId) {
    return null;
  }

  const intercom = input.toolConfig?.intercom;
  if (!intercom || typeof intercom !== "object" || Array.isArray(intercom)) {
    return null;
  }

  const helpCenterId =
    "helpCenterId" in intercom && typeof intercom.helpCenterId === "string"
      ? intercom.helpCenterId.trim()
      : "";
  if (!helpCenterId) {
    return null;
  }

  const rawCollectionIds =
    "collectionIds" in intercom && Array.isArray(intercom.collectionIds)
      ? intercom.collectionIds
      : [];
  const collectionIds = rawCollectionIds.filter((id): id is string => typeof id === "string");

  return buildIntercomImportScopeKey({
    projectId,
    helpCenterId,
    collectionIds,
  });
}

export function buildIntercomImportScopeKey(input: {
  projectId: string;
  helpCenterId: string;
  collectionIds: readonly string[];
}): string {
  const collections = [
    ...new Set(input.collectionIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  ].toSorted();
  return `${input.projectId.trim()}|${input.helpCenterId.trim()}|${collections.join(",")}`;
}

export function encodeIntercomImportScopeCursor(scopeKey: string): string {
  return `${INTERCOM_IMPORT_SCOPE_PREFIX}${scopeKey}`;
}

export function readIntercomImportScopeCursor(
  listCursor: string | null | undefined,
): string | null {
  if (!listCursor?.startsWith(INTERCOM_IMPORT_SCOPE_PREFIX)) {
    return null;
  }
  const scopeKey = listCursor.slice(INTERCOM_IMPORT_SCOPE_PREFIX.length);
  return scopeKey.length > 0 ? scopeKey : null;
}

export function intercomMappingMatchesTarget(
  mapping: { projectId: string; helpCenterId: string },
  target: { projectId: string; helpCenterId: string },
): boolean {
  return mapping.projectId === target.projectId && mapping.helpCenterId === target.helpCenterId;
}

export function intercomArticleInConfiguredCollections(
  parentIds: readonly number[],
  collectionIds: readonly string[],
): boolean {
  const allowedCollectionIds = new Set(
    collectionIds.map((id) => id.trim()).filter((id) => id.length > 0),
  );
  if (allowedCollectionIds.size === 0) {
    return true;
  }
  return articleBelongsToCollections(parentIds, allowedCollectionIds);
}
