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
import { splitTemplate } from "./visual-workflow-upstream-fields";

/** The node a field reference becomes inside the template editor. */
export const FIELD_REFERENCE_NODE = "fieldReference";

type InlineContent =
  | { type: "text"; text: string }
  | { type: "fieldReference"; attrs: { raw: string } };

export type TemplateDocument = {
  type: "doc";
  content: { type: "paragraph"; content?: InlineContent[] }[];
};

/** A line of a setting's text as inline content: plain text, and a node per field it reads. */
export function templateLineContent(line: string): InlineContent[] {
  return splitTemplate(line).flatMap((segment): InlineContent[] =>
    segment.kind === "text"
      ? segment.text
        ? [{ type: "text", text: segment.text }]
        : []
      : [{ type: FIELD_REFERENCE_NODE, attrs: { raw: segment.raw } }],
  );
}

/**
 * A setting's text as an editor document: a paragraph per line. A single-line setting keeps any
 * line break it holds as a space, as a one-line box would show it.
 */
export function templateToDocument(text: string, { multiline }: { multiline: boolean }) {
  const lines = multiline ? text.split("\n") : [text.replaceAll("\n", " ")];
  return {
    type: "doc",
    content: lines.map((line) => {
      const content = templateLineContent(line);
      return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
    }),
  } satisfies TemplateDocument;
}

/** The parts of a document the editor holds, read back as text. */
type DocumentLike = {
  forEach: (visit: (child: ParagraphLike) => void) => void;
};
type ParagraphLike = {
  forEach: (visit: (child: InlineLike) => void) => void;
};
type InlineLike = {
  isText: boolean;
  text?: string | null;
  type: { name: string };
  attrs: Record<string, unknown>;
};

/** The editor's document as the setting's text: each field reference as the text it was typed as. */
export function documentToTemplate(doc: DocumentLike): string {
  const lines: string[] = [];
  doc.forEach((paragraph) => {
    let line = "";
    paragraph.forEach((child) => {
      if (child.isText) {
        line += child.text ?? "";
      } else if (child.type.name === FIELD_REFERENCE_NODE) {
        line += typeof child.attrs.raw === "string" ? child.attrs.raw : "";
      }
    });
    lines.push(line);
  });
  return lines.join("\n");
}
