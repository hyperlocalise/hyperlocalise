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

export function isContentEditorImageGenerating(input: {
  isPending: boolean;
  pendingExternalStringId?: string;
  pendingTargetLocale?: string;
  targetLocale: string;
  externalStringId: string;
}) {
  if (!input.isPending) {
    return false;
  }
  if ((input.pendingTargetLocale ?? input.targetLocale) !== input.targetLocale) {
    return false;
  }
  if (!input.pendingExternalStringId) {
    return true;
  }
  return input.pendingExternalStringId === input.externalStringId;
}
