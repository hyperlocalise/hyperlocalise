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
import type { CatTmMatchKind } from "@/components/cat/shared/types";

export const TM_LOW_MATCH_CONFIRM_THRESHOLD = 70;

export function inferTmMatchKind(
  matchPercent: number,
  querySourceText: string,
  tmSourceText: string,
): CatTmMatchKind {
  if (matchPercent < 100) {
    return "fuzzy";
  }

  if (querySourceText.trim() === tmSourceText.trim()) {
    return "exact";
  }

  return "context";
}

export function requiresLowMatchConfirmation(matchPercent: number): boolean {
  return matchPercent < TM_LOW_MATCH_CONFIRM_THRESHOLD;
}
