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
import type { Editor } from "@tiptap/core";

import type { DocumentGlossaryTerm } from "./document-editor-assistant.types";
import { reliableDocumentBlockSource, type DocumentBlockSignature } from "./document-editor-blocks";
import { documentBlocksFromNode } from "./document-editor-translate";

export type DocumentGlossaryFinding = {
  term: DocumentGlossaryTerm;
  /** `missing`: approved target absent. `forbidden`: a forbidden target is used. */
  status: "ok" | "missing" | "forbidden";
};

const REGEXP_SPECIAL = /[.*+?^${}()|[\]\\]/g;

function includesTerm(text: string, term: string) {
  const needle = term.trim().toLocaleLowerCase();
  return needle.length > 0 && text.toLocaleLowerCase().includes(needle);
}

function sourceSpanMatchingSelection(sourceText: string, selectedText: string) {
  const selected = selectedText.trim();
  if (!selected) return null;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])${selected.replace(REGEXP_SPECIAL, "\\$&")}(?![\\p{L}\\p{N}_])`,
    "iu",
  );
  return pattern.exec(sourceText)?.[0] ?? null;
}

/**
 * Source term for text selected in one target block.
 * A span that still appears in the source block keeps the source spelling.
 * A selection of the whole translated block uses that source block.
 * Anything else stays blank so the target translation is not stored as the source term.
 */
export function glossarySourceTermFromBlock(
  sourceText: string | null,
  targetText: string,
  selectedText: string,
) {
  if (sourceText === null) return "";
  const selected = selectedText.trim();
  const source = sourceText.trim();
  if (!selected || !source) return "";
  const sourceSpan = sourceSpanMatchingSelection(source, selected);
  if (sourceSpan) return sourceSpan;
  if (selected === targetText.trim()) return source;
  return "";
}

/** Terms to prefill when the target editor selection is added to the glossary. */
export function glossaryEntryFromTargetSelection(
  editor: Editor,
  sourceBlocks: DocumentBlockSignature[],
  selectedText: string,
) {
  const targetTerm = selectedText.trim();
  const { from, to, empty } = editor.state.selection;
  if (empty || !targetTerm) {
    return { sourceTerm: "", targetTerm };
  }
  const doc = editor.state.doc;
  const blockIndex = doc.resolve(from).index(0);
  const endIndex = doc.resolve(Math.max(from, to - 1)).index(0);
  if (blockIndex !== endIndex || blockIndex >= doc.childCount) {
    return { sourceTerm: "", targetTerm };
  }
  const sourceIndex = reliableDocumentBlockSource(
    sourceBlocks,
    documentBlocksFromNode(doc),
    blockIndex,
  );
  const node = doc.child(blockIndex);
  return {
    sourceTerm: glossarySourceTermFromBlock(
      sourceIndex === null ? null : (sourceBlocks[sourceIndex]?.text ?? null),
      node.textBetween(0, node.content.size, "\n", "\n"),
      targetTerm,
    ),
    targetTerm,
  };
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
