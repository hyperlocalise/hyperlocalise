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
import type { CatGlossaryConceptTerm } from "@/components/cat/shared/types";

export type CatGlossaryTermStatus =
  | "preferred"
  | "admitted"
  | "draft"
  | "not_recommended"
  | "obsolete";

export function normalizedCatGlossaryTermStatus(
  term: CatGlossaryConceptTerm,
): CatGlossaryTermStatus {
  const normalized = term.status?.trim().toLowerCase().replaceAll(" ", "_");

  if (normalized) {
    if (normalized === "forbidden" || normalized === "not_recommended") {
      return "not_recommended";
    }
    if (normalized === "preferred") {
      return "preferred";
    }
    if (normalized === "admitted" || normalized === "draft" || normalized === "obsolete") {
      return normalized;
    }

    if (term.forbidden) {
      return "not_recommended";
    }
  }

  if (term.forbidden) {
    return "not_recommended";
  }
  if (term.preferred) {
    return "preferred";
  }
  return "draft";
}
