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

export type AssigneeOverflowParts = {
  firstLabel: string | null;
  remainingCount: number;
  fullLabel: string;
};

export function getAssigneeOverflowParts(labels: readonly string[]): AssigneeOverflowParts {
  const visibleLabels = labels.filter((label) => label.length > 0);
  return {
    firstLabel: visibleLabels[0] ?? null,
    remainingCount: Math.max(visibleLabels.length - 1, 0),
    fullLabel: visibleLabels.join(", "),
  };
}
