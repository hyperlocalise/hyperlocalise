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

export function isNativeContentEditorProviderKind(
  providerKind: string | null | undefined,
): boolean {
  return providerKind == null || providerKind === "native";
}

export function isNativeContentEditorFile(
  file?: {
    provider?: { kind?: string | null } | null;
  } | null,
): boolean {
  return isNativeContentEditorProviderKind(file?.provider?.kind);
}

export function isContentEditorGroupingAvailable(
  file?: {
    provider?: { kind?: string | null } | null;
  } | null,
): boolean {
  return file != null && isNativeContentEditorFile(file);
}
