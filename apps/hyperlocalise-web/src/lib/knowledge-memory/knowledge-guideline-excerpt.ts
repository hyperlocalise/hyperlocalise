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

const DEFAULT_MAX_LENGTH = 140;

export function excerptGuidelineText(content: string, maxLength = DEFAULT_MAX_LENGTH) {
  const trimmed = content.trim();
  if (!trimmed) {
    return "";
  }

  const collapsed = trimmed.replace(/\s+/g, " ");
  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  return `${collapsed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
