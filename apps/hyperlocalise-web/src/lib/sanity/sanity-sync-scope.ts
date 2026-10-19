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

import type { WorkspaceAutomationToolConfig } from "@/lib/agents/workspace-automation-types";

import { SANITY_IMPORT_STALE_CONFIG, SANITY_PUSH_STALE_CONFIG } from "./constants";

const SANITY_IMPORT_SCOPE_PREFIX = "scope:";

export { SANITY_IMPORT_STALE_CONFIG, SANITY_PUSH_STALE_CONFIG };

export type SanitySyncStaleConfigCode =
  | typeof SANITY_IMPORT_STALE_CONFIG
  | typeof SANITY_PUSH_STALE_CONFIG;

export class SanitySyncStaleConfigError extends Error {
  readonly code: SanitySyncStaleConfigCode;

  constructor(code: SanitySyncStaleConfigCode) {
    super(code);
    this.name = "SanitySyncStaleConfigError";
    this.code = code;
  }
}

export function isSanitySyncStaleConfigError(error: object): error is SanitySyncStaleConfigError {
  return error instanceof SanitySyncStaleConfigError;
}

export function resolveSanityAutomationFreshness(input: {
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

export function resolveSanityAutomationScopeFreshness(input: {
  snapshotScopeKey: string;
  liveScopeKey: string | null;
}): "current" | "stale" {
  if (input.liveScopeKey == null || input.liveScopeKey !== input.snapshotScopeKey) {
    return "stale";
  }
  return "current";
}

export function readLiveSanityScopeKey(input: {
  projectId: string | null;
  toolConfig: WorkspaceAutomationToolConfig | null | undefined;
}): string | null {
  const nativeProjectId = input.projectId?.trim();
  if (!nativeProjectId) {
    return null;
  }

  const sanity = input.toolConfig?.sanity;
  if (!sanity || typeof sanity !== "object" || Array.isArray(sanity)) {
    return null;
  }

  const sanityProjectId =
    "projectId" in sanity && typeof sanity.projectId === "string" ? sanity.projectId.trim() : "";
  const dataset =
    "dataset" in sanity && typeof sanity.dataset === "string" ? sanity.dataset.trim() : "";
  if (!sanityProjectId || !dataset) {
    return null;
  }

  const rawTypes =
    "documentTypes" in sanity && Array.isArray(sanity.documentTypes) ? sanity.documentTypes : [];
  const documentTypes = rawTypes.filter((type): type is string => typeof type === "string");

  return buildSanityImportScopeKey({
    nativeProjectId,
    sanityProjectId,
    dataset,
    documentTypes,
  });
}

export function readLiveSanityOverwriteDrafts(
  toolConfig: WorkspaceAutomationToolConfig | null | undefined,
): boolean | null {
  const sanity = toolConfig?.sanity;
  if (!sanity || typeof sanity !== "object" || Array.isArray(sanity)) {
    return null;
  }
  if (!("overwriteSanityDrafts" in sanity) || typeof sanity.overwriteSanityDrafts !== "boolean") {
    return null;
  }
  return sanity.overwriteSanityDrafts;
}

export function buildSanityImportScopeKey(input: {
  nativeProjectId: string;
  sanityProjectId: string;
  dataset: string;
  documentTypes: readonly string[];
}): string {
  const types = [
    ...new Set(input.documentTypes.map((type) => type.trim()).filter((type) => type.length > 0)),
  ].toSorted();
  return `${input.nativeProjectId.trim()}|${input.sanityProjectId.trim()}|${input.dataset.trim()}|${types.join(",")}`;
}

export function encodeSanityImportScopeCursor(scopeKey: string): string {
  return `${SANITY_IMPORT_SCOPE_PREFIX}${scopeKey}`;
}

export function readSanityImportScopeCursor(listCursor: string | null | undefined): string | null {
  if (!listCursor?.startsWith(SANITY_IMPORT_SCOPE_PREFIX)) {
    return null;
  }
  const scopeKey = listCursor.slice(SANITY_IMPORT_SCOPE_PREFIX.length);
  return scopeKey.length > 0 ? scopeKey : null;
}

export function sanityMappingMatchesTarget(
  mapping: {
    projectId: string;
    sanityProjectId: string;
    dataset: string;
  },
  target: {
    projectId: string;
    sanityProjectId: string;
    dataset: string;
  },
): boolean {
  return (
    mapping.projectId === target.projectId &&
    mapping.sanityProjectId === target.sanityProjectId &&
    mapping.dataset === target.dataset
  );
}
