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
import type { Editor, JSONContent } from "@tiptap/core";
import type { Mark } from "@tiptap/pm/model";

function marksToJson(marks: readonly Mark[]): JSONContent["marks"] {
  if (marks.length === 0) {
    return undefined;
  }
  return marks.map((mark) => ({
    type: mark.type.name,
    ...(Object.keys(mark.attrs).length > 0 ? { attrs: mark.attrs } : {}),
  }));
}

function sharedMarksJson(editor: Editor, from: number, to: number): JSONContent["marks"] {
  if (from === to) {
    return undefined;
  }
  let shared: readonly Mark[] | null = null;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) {
      return;
    }
    shared = shared
      ? shared.filter((mark) => mark.isInSet(node.marks))
      : node.marks;
  });
  return shared ? marksToJson(shared) : undefined;
}

function suggestionInlineContent(suggestion: string, marks?: JSONContent["marks"]): JSONContent[] {
  return suggestion.split("\n").flatMap((line, index) => [
    ...(index ? [{ type: "hardBreak" }] : []),
    ...(line ? [{ type: "text", text: line, ...(marks ? { marks } : {}) }] : []),
  ]);
}

function selectedTextblocks(editor: Editor, from: number, to: number) {
  const blocks: { from: number; to: number }[] = [];
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) {
      return;
    }
    const contentFrom = pos + 1;
    const contentTo = pos + node.nodeSize - 1;
    const rangeFrom = Math.max(from, contentFrom);
    const rangeTo = Math.min(to, contentTo);
    if (rangeFrom < rangeTo || (from <= contentFrom && to >= contentTo)) {
      blocks.push({ from: rangeFrom, to: Math.max(rangeFrom, rangeTo) });
    }
    return false;
  });
  return blocks;
}

function lineForBlock(lines: string[], index: number, blockCount: number) {
  if (index < blockCount - 1) {
    return lines[index] ?? "";
  }
  return lines.slice(index).join("\n");
}

export function replaceMarkdownSelection(
  editor: Editor,
  from: number,
  to: number,
  suggestion: string,
): boolean {
  const blocks = selectedTextblocks(editor, from, to);
  if (blocks.length === 0) {
    return false;
  }

  const lines = suggestion.split("\n");
  let chain = editor.chain().focus();
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    const content = suggestionInlineContent(
      lineForBlock(lines, index, blocks.length),
      sharedMarksJson(editor, block.from, block.to),
    );
    chain =
      content.length > 0
        ? chain.insertContentAt({ from: block.from, to: block.to }, content)
        : chain.deleteRange({ from: block.from, to: block.to });
  }
  return chain.run();
}
