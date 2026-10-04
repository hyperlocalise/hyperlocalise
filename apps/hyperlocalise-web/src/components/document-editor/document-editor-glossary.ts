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
import type { DocumentGlossaryTerm } from "./document-editor-assistant.types";

export type DocumentGlossaryFinding = {
  term: DocumentGlossaryTerm;
  /** `missing`: approved target absent. `forbidden`: a forbidden target is used. */
  status: "ok" | "missing" | "forbidden";
};

function includesTerm(text: string, term: string) {
  const needle = term.trim().toLocaleLowerCase();
  return needle.length > 0 && text.toLocaleLowerCase().includes(needle);
}

/** Glossary terms that occur in the source block, checked against the target block. */
export function checkDocumentGlossary(
  terms: DocumentGlossaryTerm[],
  sourceText: string,
  targetText: string,
): DocumentGlossaryFinding[] {
  const findings: DocumentGlossaryFinding[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    if (seen.has(term.id) || !includesTerm(sourceText, term.source)) continue;
    seen.add(term.id);
    const used = includesTerm(targetText, term.target);
    if (term.forbidden) {
      findings.push({ term, status: used ? "forbidden" : "ok" });
    } else {
      findings.push({ term, status: used || !term.approved ? "ok" : "missing" });
    }
  }
  const rank = { forbidden: 0, missing: 1, ok: 2 } as const;
  return findings.toSorted((a, b) => rank[a.status] - rank[b.status]);
}
