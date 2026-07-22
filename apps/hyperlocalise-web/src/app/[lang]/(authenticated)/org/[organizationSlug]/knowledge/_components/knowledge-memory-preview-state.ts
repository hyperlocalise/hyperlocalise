/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
export function getKnowledgeMemoryPreviewState(input: {
  targetLocale: string;
  sourceText: string;
  isPreviewing: boolean;
}) {
  const hasQuery = input.targetLocale.trim().length > 0 || input.sourceText.trim().length > 0;

  return {
    hasQuery,
    canPreview: hasQuery && !input.isPreviewing,
  };
}

export function formatMemoryReductionPercent(value: number) {
  return `${Math.max(0, value).toFixed(0)}% smaller`;
}
