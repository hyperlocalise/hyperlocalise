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

const INLINE_NODE_TYPES = new Set(["text", "hardBreak", "mdxInline"]);
const TEXTBLOCK_NODE_TYPES = new Set(["paragraph", "heading", "codeBlock"]);
const ALLOWED_MARKS = new Set(["bold", "italic", "strike", "code", "link"]);
const SAFE_HREF_PATTERN = /^(https?:|mailto:|mention:|#|\/)/i;
const HTML_TAG_PATTERN =
  /<\/?(?:a|b|em|i|strong|u|s|del|ins|mark|span|div|p|br|img|script|iframe|svg|video|audio|object|embed|style|link|form|input|button|textarea|select|meta|base|html|body|head)\b[^>]*>/gi;
const FENCED_MARKDOWN_PATTERN = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/i;

function asNodeArray(content: JSONContent | JSONContent[] | undefined): JSONContent[] {
  if (!content) {
    return [];
  }
  return Array.isArray(content) ? content : [content];
}

function wrapSliceContent(nodes: JSONContent[]): JSONContent[] {
  if (nodes.length === 0) {
    return [];
  }
  if (nodes.every((node) => INLINE_NODE_TYPES.has(node.type ?? ""))) {
    return [{ type: "paragraph", content: nodes }];
  }
  return nodes;
}

export function unwrapFencedMarkdown(text: string): string {
  const trimmed = text.trim();
  const fenced = FENCED_MARKDOWN_PATTERN.exec(trimmed);
  return fenced?.[1] ?? text;
}

export function containsHtmlTags(markdown: string): boolean {
  HTML_TAG_PATTERN.lastIndex = 0;
  return HTML_TAG_PATTERN.test(markdown);
}

export function serializeMarkdownRange(editor: Editor, from: number, to: number): string {
  if (from >= to) {
    return "";
  }
  if (!editor.markdown) {
    return editor.state.doc.textBetween(from, to, "\n");
  }
  const nodes = asNodeArray(
    editor.state.doc.slice(from, to).content.toJSON() as JSONContent | JSONContent[],
  );
  const markdown = editor.markdown.serialize({
    type: "doc",
    content: wrapSliceContent(nodes),
  });
  return markdown.replace(/\n+$/, "");
}

export function serializeMarkdownSelectionContext(
  editor: Editor,
  from: number,
  to: number,
  selectedMarkdown: string,
  maxLength: number,
): string {
  const before = serializeMarkdownRange(editor, 0, from);
  const after = serializeMarkdownRange(editor, to, editor.state.doc.content.size);
  const sideLength = Math.max(0, Math.floor((maxLength - selectedMarkdown.length) / 2));
  return `${before.slice(-sideLength)}${selectedMarkdown}${after.slice(0, sideLength)}`;
}

function isSafeHref(href: string): boolean {
  return SAFE_HREF_PATTERN.test(href);
}

function sanitizeMarks(marks: JSONContent["marks"]): JSONContent["marks"] {
  if (!marks?.length) {
    return undefined;
  }
  const next = marks.flatMap((mark) => {
    if (!ALLOWED_MARKS.has(mark.type ?? "")) {
      return [];
    }
    if (mark.type !== "link") {
      return [mark];
    }
    const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
    if (!isSafeHref(href)) {
      return [];
    }
    return [mark];
  });
  return next.length > 0 ? next : undefined;
}

function flattenInline(node: JSONContent): JSONContent[] {
  if (node.type === "text") {
    return node.text ? [node] : [];
  }
  if (node.type === "hardBreak" || node.type === "mdxInline") {
    return [node];
  }
  return asNodeArray(node.content).flatMap(flattenInline);
}

function sanitizeInline(nodes: JSONContent[]): JSONContent[] {
  return nodes.flatMap((node) => {
    if (node.type === "text") {
      if (!node.text) {
        return [];
      }
      const marks = sanitizeMarks(node.marks);
      return [{ type: "text", text: node.text, ...(marks ? { marks } : {}) }];
    }
    if (node.type === "hardBreak") {
      return [{ type: "hardBreak" }];
    }
    if (node.type === "mdxInline") {
      return [node];
    }
    return [];
  });
}

export function applySharedMarks(
  nodes: JSONContent[],
  shared?: JSONContent["marks"],
): JSONContent[] {
  if (!shared?.length) {
    return nodes;
  }
  return nodes.map((node) => {
    if (node.type !== "text") {
      return node;
    }
    const existing = node.marks ?? [];
    const existingTypes = new Set(existing.map((mark) => mark.type));
    const extra = shared.filter((mark) => !existingTypes.has(mark.type ?? ""));
    return extra.length > 0 ? { ...node, marks: [...existing, ...extra] } : node;
  });
}

function parsedTextblocks(parsed: JSONContent): JSONContent[][] {
  const blocks: JSONContent[][] = [];
  const walk = (node: JSONContent) => {
    if (TEXTBLOCK_NODE_TYPES.has(node.type ?? "")) {
      blocks.push(sanitizeInline(flattenInline(node)));
      return;
    }
    for (const child of asNodeArray(node.content)) {
      walk(child);
    }
  };
  for (const child of asNodeArray(parsed.content)) {
    walk(child);
  }
  return blocks;
}

function inlineMarkdownContent(editor: Editor, line: string): JSONContent[] {
  if (!line) {
    return [];
  }
  if (!editor.markdown || containsHtmlTags(line)) {
    return [{ type: "text", text: line }];
  }
  const blocks = parsedTextblocks(editor.markdown.parse(line));
  if (blocks.every((nodes) => nodes.length === 0)) {
    return [{ type: "text", text: line }];
  }
  return blocks.flatMap((nodes, index) =>
    index === 0 ? nodes : [{ type: "hardBreak" }, ...nodes],
  );
}

export function suggestionBlocksFromMarkdown(editor: Editor, suggestion: string): JSONContent[][] {
  return unwrapFencedMarkdown(suggestion)
    .split("\n")
    .map((line) => inlineMarkdownContent(editor, line));
}

export function contentForBlock(
  blocks: JSONContent[][],
  index: number,
  blockCount: number,
): JSONContent[] {
  if (index < blockCount - 1) {
    return blocks[index] ?? [];
  }
  const rest = blocks.slice(index);
  if (rest.length <= 1) {
    return rest[0] ?? [];
  }
  return rest.flatMap((nodes, nodeIndex) =>
    nodeIndex === 0 ? nodes : [{ type: "hardBreak" }, ...nodes],
  );
}
