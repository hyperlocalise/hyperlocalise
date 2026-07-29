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
export function applyGlossaryTermToTarget(
  segmentSourceText: string,
  currentTargetText: string,
  term: { source: string; target: string; approved: boolean; forbidden: boolean },
): string {
  if (!term.approved || term.forbidden) {
    return currentTargetText;
  }

  if (currentTargetText.trim()) {
    if (currentTargetText.includes(term.source)) {
      return currentTargetText.replaceAll(term.source, term.target);
    }

    return currentTargetText;
  }

  if (segmentSourceText.includes(term.source)) {
    return segmentSourceText.replaceAll(term.source, term.target);
  }

  return term.target;
}
