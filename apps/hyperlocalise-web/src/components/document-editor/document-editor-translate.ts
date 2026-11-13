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
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  alignDocumentBlocks,
  documentBlockKind,
  documentBlocksFromJson,
  isUntranslatedBlock,
  type DocumentBlockSignature,
} from "./document-editor-blocks";
import type { DocumentSuggestion } from "./document-editor-suggestions";

/** Blocks that carry code, markup, or media rather than prose. */
const NON_TRANSLATABLE_BLOCK_TYPES = new Set(["mdxRaw", "codeBlock", "horizontalRule", "image"]);
const LETTER_PATTERN = /\p{L}/u;

export type DocumentTranslateScope = "untranslated" | "all";

export type DocumentTranslationTask = {
  sourceIndex: number;
  targetIndex: number;
};

export function documentBlocksFromNode(doc: ProseMirrorNode): DocumentBlockSignature[] {
  const blocks: DocumentBlockSignature[] = [];
  doc.forEach((node) => {
    blocks.push({
      kind: documentBlockKind(node.type.name, node.attrs),
      text: node.textBetween(0, node.content.size, "\n", "\n"),
    });
  });
  return blocks;
}

function isTranslatableSource(type: string | undefined, source: DocumentBlockSignature) {
  return !NON_TRANSLATABLE_BLOCK_TYPES.has(type ?? "") && LETTER_PATTERN.test(source.text);
}

export function planDocumentTranslation(
  sourceDoc: JSONContent,
  targetDoc: ProseMirrorNode,
  scope: DocumentTranslateScope,
): DocumentTranslationTask[] {
  const sourceBlocks = documentBlocksFromJson(sourceDoc);
  const targetBlocks = documentBlocksFromNode(targetDoc);
  const alignment = alignDocumentBlocks(sourceBlocks, targetBlocks);
  const tasks: DocumentTranslationTask[] = [];
  alignment.forEach((sourceIndex, targetIndex) => {
    if (sourceIndex === null) return;
    const source = sourceBlocks[sourceIndex];
    if (!isTranslatableSource(targetDoc.child(targetIndex).type.name, source)) return;
    if (scope === "untranslated" && !isUntranslatedBlock(targetBlocks[targetIndex], source)) {
      return;
    }
    tasks.push({ sourceIndex, targetIndex });
  });
  return tasks;
}

/** Target block indexes that still read as their source. */
export function untranslatedDocumentBlocks(
  sourceBlocks: DocumentBlockSignature[],
  targetDoc: ProseMirrorNode,
): Set<number> {
  const targetBlocks = documentBlocksFromNode(targetDoc);
  const alignment = alignDocumentBlocks(sourceBlocks, targetBlocks);
  const flagged = new Set<number>();
  alignment.forEach((sourceIndex, targetIndex) => {
    if (sourceIndex === null) return;
    const source = sourceBlocks[sourceIndex];
    if (
      isTranslatableSource(targetDoc.child(targetIndex).type.name, source) &&
      isUntranslatedBlock(targetBlocks[targetIndex], source)
    ) {
      flagged.add(targetIndex);
    }
  });
  return flagged;
}

export function documentBlockRange(doc: ProseMirrorNode, index: number) {
  if (index < 0 || index >= doc.childCount) return null;
  let from = 0;
  for (let child = 0; child < index; child += 1) {
    from += doc.child(child).nodeSize;
  }
  return { from, to: from + doc.child(index).nodeSize };
}

/** The target block that currently translates `sourceIndex`, after any edits. */
export function locateTargetBlock(
  sourceBlocks: DocumentBlockSignature[],
  targetDoc: ProseMirrorNode,
  sourceIndex: number,
) {
  const alignment = alignDocumentBlocks(sourceBlocks, documentBlocksFromNode(targetDoc));
  const targetIndex = alignment.indexOf(sourceIndex);
  return targetIndex === -1 ? null : targetIndex;
}

/**
 * Builds a suggestion replacing the block aligned to `sourceIndex` with
 * `replacement`. Returns null when the block is gone or nothing would change.
 */
export function buildDocumentBlockSuggestion({
  id,
  doc,
  sourceBlocks,
  sourceIndex,
  replacement,
  expectedOriginalText,
}: {
  id: string;
  doc: ProseMirrorNode;
  sourceBlocks: DocumentBlockSignature[];
  sourceIndex: number;
  replacement: JSONContent[];
  /** Block text when the AI request was sent. Skip if the block has since changed. */
  expectedOriginalText?: string;
}): DocumentSuggestion | null {
  if (replacement.length === 0) return null;
  const targetIndex = locateTargetBlock(sourceBlocks, doc, sourceIndex);
  if (targetIndex === null) return null;
  const range = documentBlockRange(doc, targetIndex);
  if (!range) return null;
  let nodes: ProseMirrorNode[];
  try {
    nodes = replacement.map((json) => doc.type.schema.nodeFromJSON(json));
  } catch {
    return null;
  }
  const originalText = doc.textBetween(range.from, range.to, "\n", "\n");
  if (expectedOriginalText !== undefined && originalText !== expectedOriginalText) {
    return null;
  }
  const replacementText = nodes
    .map((node) => node.textBetween(0, node.content.size, "\n", "\n"))
    .join("\n");
  if (replacementText.trim() === originalText.trim() || !replacementText.trim()) return null;
  return {
    id,
    from: range.from,
    to: range.to,
    originalText,
    replacement,
    replacementText,
    status: "pending",
  };
}
