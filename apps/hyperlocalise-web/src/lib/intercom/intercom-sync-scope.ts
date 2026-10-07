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
