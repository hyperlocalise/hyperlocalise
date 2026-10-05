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
const SAFE_HREF_SCHEME_PATTERN = /^(https?|mailto|mention)$/i;
const HREF_SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/i;
const HTML_TAG_PATTERN =
  /<\/?(?:a|b|em|i|strong|u|s|del|ins|mark|span|div|p|br|img|script|iframe|svg|video|audio|object|embed|style|link|form|input|button|textarea|select|meta|base|html|body|head)\b[^>]*>/gi;
const FENCED_MARKDOWN_PATTERN = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/i;
const HTML_PLACEHOLDER_PREFIX = "@@HLHTML_";
const HTML_PLACEHOLDER_SUFFIX = "@@";
const HTML_PLACEHOLDER_PATTERN = /@@HLHTML_(\d+)@@/g;

type ParsedTextblock = {
  type: string;
  content: JSONContent[];
};

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

function extractHtmlTags(markdown: string): { markdown: string; tags: string[] } {
  const tags: string[] = [];
  HTML_TAG_PATTERN.lastIndex = 0;
  const next = markdown.replace(HTML_TAG_PATTERN, (tag) => {
    const index = tags.length;
    tags.push(tag);
    return `${HTML_PLACEHOLDER_PREFIX}${index}${HTML_PLACEHOLDER_SUFFIX}`;
  });
  return { markdown: next, tags };
}

function restoreHtmlTags(nodes: JSONContent[], tags: string[]): JSONContent[] {
  if (tags.length === 0) {
    return nodes;
  }
  return nodes.flatMap((node) => {
    if (node.type !== "text" || !node.text) {
      return [node];
    }
    const parts: JSONContent[] = [];
    let lastIndex = 0;
    HTML_PLACEHOLDER_PATTERN.lastIndex = 0;
    for (const match of node.text.matchAll(HTML_PLACEHOLDER_PATTERN)) {
      const index = match.index ?? 0;
      if (index > lastIndex) {
        parts.push({
          type: "text",
          text: node.text.slice(lastIndex, index),
          ...(node.marks ? { marks: node.marks } : {}),
        });
      }
      const tag = tags[Number(match[1])];
      if (tag) {
        parts.push({
          type: "text",
          text: tag,
          ...(node.marks ? { marks: node.marks } : {}),
        });
      }
      lastIndex = index + match[0].length;
    }
    if (lastIndex < node.text.length) {
      parts.push({
        type: "text",
        text: node.text.slice(lastIndex),
        ...(node.marks ? { marks: node.marks } : {}),
      });
    }
    return parts;
  });
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

function startsTextblock(editor: Editor, pos: number): boolean {
  const $pos = editor.state.doc.resolve(pos);
  if ($pos.parent.isTextblock) {
    return $pos.parentOffset === 0;
  }
  return Boolean($pos.nodeAfter?.isBlock);
}

function endsTextblock(editor: Editor, pos: number): boolean {
  const $pos = editor.state.doc.resolve(pos);
  if ($pos.parent.isTextblock) {
    return $pos.parentOffset === $pos.parent.content.size;
  }
  return Boolean($pos.nodeBefore?.isBlock);
}

function joinMarkdown(left: string, right: string, blockBreak: boolean): string {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  if (!blockBreak) {
    return `${left}${right}`;
  }
  return `${left.replace(/\n+$/, "")}\n\n${right.replace(/^\n+/, "")}`;
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
  const prefix = before.slice(-sideLength);
  const suffix = after.slice(0, sideLength);
  return joinMarkdown(
    joinMarkdown(prefix, selectedMarkdown, prefix.length > 0 && startsTextblock(editor, from)),
    suffix,
    suffix.length > 0 && endsTextblock(editor, to),
  );
}

function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) {
    return false;
  }
  const scheme = HREF_SCHEME_PATTERN.exec(trimmed)?.[1];
  return scheme ? SAFE_HREF_SCHEME_PATTERN.test(scheme) : true;
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

function parsedTextblocks(parsed: JSONContent): ParsedTextblock[] {
  const blocks: ParsedTextblock[] = [];
  const walk = (node: JSONContent) => {
    if (TEXTBLOCK_NODE_TYPES.has(node.type ?? "")) {
      blocks.push({ type: node.type ?? "paragraph", content: sanitizeInline(flattenInline(node)) });
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

function shouldKeepParsedBlocks(parsed: ParsedTextblock[], lines: string[]): boolean {
  if (parsed.length === 0) {
    return false;
  }
  if (parsed.length > 1 || lines.length <= 1) {
    return true;
  }
  return parsed[0]?.type !== "paragraph";
}

function inlineMarkdownContent(editor: Editor, line: string): JSONContent[] {
  if (!line) {
    return [];
  }
  if (!editor.markdown) {
    return [{ type: "text", text: line }];
  }
  const blocks = parsedTextblocks(editor.markdown.parse(line));
  if (blocks.every((block) => block.content.length === 0)) {
    return [{ type: "text", text: line }];
  }
  return blocks.flatMap((block, index) =>
    index === 0 ? block.content : [{ type: "hardBreak" }, ...block.content],
  );
}

export function suggestionBlocksFromMarkdown(editor: Editor, suggestion: string): JSONContent[][] {
  const { markdown, tags } = extractHtmlTags(unwrapFencedMarkdown(suggestion));
  const lines = markdown.split("\n").filter((line) => line.length > 0);
  if (editor.markdown) {
    const parsed = parsedTextblocks(editor.markdown.parse(markdown)).filter(
      (block) => block.content.length > 0,
    );
    if (shouldKeepParsedBlocks(parsed, lines)) {
      return parsed.map((block) => restoreHtmlTags(block.content, tags));
    }
  }
  return lines.map((line) => restoreHtmlTags(inlineMarkdownContent(editor, line), tags));
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
