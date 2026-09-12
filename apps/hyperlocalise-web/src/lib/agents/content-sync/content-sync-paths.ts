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
import {
  isSafeRepositoryRelativePath,
  normalizeRepositoryRelativePath,
} from "@/lib/i18n/safe-repository-path";

export function normalizeContentSyncFolder(path: string): string {
  return normalizeRepositoryRelativePath(path).replace(/\/+$/, "");
}

export function isSafeContentSyncFolder(path: string): boolean {
  const normalized = normalizeContentSyncFolder(path);
  if (normalized.length === 0) {
    return true;
  }
  return isSafeRepositoryRelativePath(normalized);
}

export function buildContentSyncFingerprint(input: {
  provider: string;
  resourceKey: string;
  providerFolder: string;
}): string {
  return JSON.stringify([
    input.provider.trim(),
    input.resourceKey.trim(),
    normalizeContentSyncFolder(input.providerFolder),
  ]);
}

export function joinContentSyncPath(folder: string, relativePath: string): string {
  const prefix = normalizeContentSyncFolder(folder);
  const suffix = normalizeRepositoryRelativePath(relativePath);
  if (!prefix) {
    return suffix;
  }
  if (!suffix) {
    return prefix;
  }
  return `${prefix}/${suffix}`;
}

export function relativizeContentSyncPath(folder: string, fullPath: string): string | null {
  const prefix = normalizeContentSyncFolder(folder);
  const normalized = normalizeRepositoryRelativePath(fullPath);
  if (!prefix) {
    return normalized;
  }
  if (normalized === prefix) {
    return "";
  }
  if (!normalized.startsWith(`${prefix}/`)) {
    return null;
  }
  return normalized.slice(prefix.length + 1);
}

export function rewriteContentSyncSourcePath(input: {
  sandboxPath: string;
  providerFolder: string;
  projectFolder: string;
}): string | null {
  const relative = relativizeContentSyncPath(input.providerFolder, input.sandboxPath);
  if (relative === null) {
    return null;
  }
  return joinContentSyncPath(input.projectFolder, relative);
}

export function rewriteContentSyncProviderPath(input: {
  projectPath: string;
  providerFolder: string;
  projectFolder: string;
}): string | null {
  const relative = relativizeContentSyncPath(input.projectFolder, input.projectPath);
  if (relative === null) {
    return null;
  }
  return joinContentSyncPath(input.providerFolder, relative);
}
