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
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { contentEditorTextOffsetRanges } from "./content-editor-target-editor";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    hard_break: { group: "inline", inline: true },
  },
});

function docFromLines(lines: Array<Array<{ type: string; text?: string }>>) {
  return schema.nodeFromJSON({
    type: "doc",
    content: lines.map((content) => ({
      type: "paragraph",
      content: content.length > 0 ? content : undefined,
    })),
  });
}

function textAtMappedToken(doc: ProseMirrorNode, token: string) {
  const text = doc.textBetween(0, doc.content.size, "\n", "\n");
  const start = text.indexOf(token);
  const range = contentEditorTextOffsetRanges(doc).find(
    (item) => start >= item.offsetStart && start < item.offsetEnd,
  );
  expect(range).toBeTruthy();
  const from = range!.posStart + (start - range!.offsetStart);
  return doc.textBetween(from, from + token.length);
}

describe("contentEditorTextOffsetRanges", () => {
  it("counts both newlines of a blank line before a later token", () => {
    const doc = docFromLines([
      [{ type: "text", text: "Before" }],
      [],
      [{ type: "text", text: "After the gap" }],
    ]);
    const text = doc.textBetween(0, doc.content.size, "\n", "\n");

    expect(text).toBe("Before\n\nAfter the gap");
    expect(textAtMappedToken(doc, "After")).toBe("After");
  });

  it("counts a leading blank line before the first text node", () => {
    const doc = docFromLines([[], [{ type: "text", text: "After" }]]);

    expect(doc.textBetween(0, doc.content.size, "\n", "\n")).toBe("\nAfter");
    expect(textAtMappedToken(doc, "After")).toBe("After");
  });

  it("counts one newline between adjacent paragraphs", () => {
    const doc = docFromLines([
      [{ type: "text", text: "Before" }],
      [{ type: "text", text: "After" }],
    ]);

    expect(doc.textBetween(0, doc.content.size, "\n", "\n")).toBe("Before\nAfter");
    expect(textAtMappedToken(doc, "After")).toBe("After");
  });

  it("counts a hard break as one newline inside a paragraph", () => {
    const doc = docFromLines([
      [{ type: "text", text: "Hi" }, { type: "hard_break" }, { type: "text", text: "Yo" }],
    ]);

    expect(doc.textBetween(0, doc.content.size, "\n", "\n")).toBe("Hi\nYo");
    expect(textAtMappedToken(doc, "Yo")).toBe("Yo");
  });
});
