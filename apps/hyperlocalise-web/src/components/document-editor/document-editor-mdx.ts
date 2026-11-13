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
import { Node, type JSONContent, type MarkdownToken } from "@tiptap/core";

import {
  commonIndent,
  dedentLines,
  findJsxClosingTag,
  indentLines,
  readBalancedBraces,
  readJsxOpenTag,
} from "./document-editor-mdx-syntax";

const ESM_PATTERN = /^(?:import|export)\b[^\n]*(?:\n(?![ \t]*\n)[^\n]*)*(?:\n|$)/;
const LEAD_PATTERN = /^ {0,3}/;

function restOfLineIsBlank(src: string, from: number) {
  const lineEnd = src.indexOf("\n", from);
  const rest = lineEnd === -1 ? src.slice(from) : src.slice(from, lineEnd);
  if (rest.trim()) {
    return null;
  }
  return lineEnd === -1 ? src.length : lineEnd + 1;
}

function stripTrailingNewline(raw: string) {
  return raw.endsWith("\n") ? raw.slice(0, -1) : raw;
}

function readEsmBlock(src: string) {
  const match = ESM_PATTERN.exec(src);
  return match ? match[0] : null;
}

function readExpressionBlock(src: string) {
  const lead = LEAD_PATTERN.exec(src)?.[0] ?? "";
  const end = readBalancedBraces(src, lead.length);
  if (end === null) {
    return null;
  }
  const lineEnd = restOfLineIsBlank(src, end);
  return lineEnd === null ? null : src.slice(0, lineEnd);
}

/**
 * Locked MDX source kept byte for byte: `import`/`export` statements,
 * block expressions, and self-closing components.
 */
export const MdxRaw = Node.create({
  name: "mdxRaw",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return { value: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "div[data-mdx-raw]" }];
  },

  renderHTML({ node }) {
    return ["div", { "data-mdx-raw": "" }, ["code", {}, node.attrs.value]];
  },

  markdownTokenName: "mdxRaw",

  markdownTokenizer: {
    name: "mdxRaw",
    level: "block",
    start: (src: string) => {
      const match = /^(?: {0,3}<[A-Za-z]| {0,3}\{|import\b|export\b)/m.exec(src);
      return match ? match.index : -1;
    },
    tokenize: (src: string) => {
      const esm = readEsmBlock(src);
      if (esm) {
        return { type: "mdxRaw", raw: esm, text: stripTrailingNewline(esm) };
      }
      const expression = readExpressionBlock(src);
      if (expression) {
        return { type: "mdxRaw", raw: expression, text: stripTrailingNewline(expression) };
      }
      const lead = LEAD_PATTERN.exec(src)?.[0] ?? "";
      const open = readJsxOpenTag(src, lead.length);
      if (!open?.selfClosing) {
        return undefined;
      }
      const lineEnd = restOfLineIsBlank(src, open.end);
      if (lineEnd === null) {
        return undefined;
      }
      const raw = src.slice(0, lineEnd);
      return { type: "mdxRaw", raw, text: stripTrailingNewline(raw) };
    },
  },

  parseMarkdown: (token: MarkdownToken, helpers) =>
    helpers.createNode("mdxRaw", { value: token.text ?? "" }, []),

  renderMarkdown: (node: JSONContent) => String(node.attrs?.value ?? ""),
});

/**
 * A JSX element with Markdown children. The open tag is stored as written and
 * edited in place, so unchanged props serialize exactly as they were read.
 */
export const MdxComponent = Node.create({
  name: "mdxComponent",
  group: "block",
  content: "block+",
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      name: { default: "" },
      openTag: { default: "" },
      closeTag: { default: "" },
      lead: { default: "" },
      childIndent: { default: "" },
      closeIndent: { default: "" },
      layout: { default: "block" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-mdx-component]" }];
  },

  renderHTML({ node }) {
    return ["div", { "data-mdx-component": node.attrs.name }, 0];
  },

  markdownTokenName: "mdxComponent",

  markdownTokenizer: {
    name: "mdxComponent",
    level: "block",
    start: (src: string) => {
      const match = /^ {0,3}<[A-Za-z]/m.exec(src);
      return match ? match.index : -1;
    },
    tokenize: (src: string, _tokens, lexer) => {
      const lead = LEAD_PATTERN.exec(src)?.[0] ?? "";
      const open = readJsxOpenTag(src, lead.length);
      if (!open || open.selfClosing) {
        return undefined;
      }
      const close = findJsxClosingTag(src, open.name, open.end);
      if (!close) {
        return undefined;
      }
      const lineEnd = restOfLineIsBlank(src, close.end);
      if (lineEnd === null) {
        return undefined;
      }
      const inner = src.slice(open.end, close.start);
      const layout = inner.includes("\n") ? "block" : "inline";
      let childIndent = "";
      let closeIndent = "";
      let body = inner.trim();
      if (layout === "block") {
        const lines = inner.replace(/^[ \t]*\n/, "").split("\n");
        closeIndent = /^[ \t]*$/.test(lines.at(-1) ?? "") ? (lines.pop() ?? "") : "";
        const content = lines.join("\n");
        childIndent = commonIndent(content);
        body = dedentLines(content, childIndent).trim();
      }
      return {
        type: "mdxComponent",
        raw: src.slice(0, lineEnd),
        name: open.name,
        openTag: open.raw,
        closeTag: src.slice(close.start, close.end),
        lead,
        childIndent,
        closeIndent,
        layout,
        tokens: body ? lexer.blockTokens(body) : [],
      };
    },
  },

  parseMarkdown: (token: MarkdownToken, helpers) => {
    const children = helpers.parseChildren(token.tokens ?? []);
    return helpers.createNode(
      "mdxComponent",
      {
        name: token.name,
        openTag: token.openTag,
        closeTag: token.closeTag,
        lead: token.lead,
        childIndent: token.childIndent,
        closeIndent: token.closeIndent,
        layout: token.layout,
      },
      children.length > 0 ? children : [{ type: "paragraph" }],
    );
  },

  renderMarkdown: (node: JSONContent, helpers) => {
    const attrs = node.attrs ?? {};
    const children = helpers.renderChildren(node.content ?? [], "\n\n").trim();
    if (attrs.layout === "inline" && !children.includes("\n")) {
      return `${attrs.lead}${attrs.openTag}${children}${attrs.closeTag}`;
    }
    return [
      `${attrs.lead}${attrs.openTag}`,
      indentLines(children, String(attrs.childIndent ?? "")),
      `${attrs.closeIndent}${attrs.closeTag}`,
    ].join("\n");
  },
});

/** Inline JSX or `{expression}` inside a paragraph, kept verbatim. */
export const MdxInline = Node.create({
  name: "mdxInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { value: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "span[data-mdx-inline]" }];
  },

  renderHTML({ node }) {
    return ["span", { "data-mdx-inline": "" }, node.attrs.value];
  },

  markdownTokenName: "mdxInline",

  markdownTokenizer: {
    name: "mdxInline",
    level: "inline",
    start: (src: string) => {
      const match = /<[A-Za-z]|\{/.exec(src);
      return match ? match.index : -1;
    },
    tokenize: (src: string) => {
      if (src.startsWith("{")) {
        const end = readBalancedBraces(src, 0);
        return end === null ? undefined : { type: "mdxInline", raw: src.slice(0, end) };
      }
      const open = readJsxOpenTag(src, 0);
      if (!open) {
        return undefined;
      }
      if (open.selfClosing) {
        return { type: "mdxInline", raw: open.raw };
      }
      const close = findJsxClosingTag(src, open.name, open.end);
      return close ? { type: "mdxInline", raw: src.slice(0, close.end) } : undefined;
    },
  },

  parseMarkdown: (token: MarkdownToken, helpers) =>
    helpers.createNode("mdxInline", { value: token.raw ?? "" }, []),

  renderMarkdown: (node: JSONContent) => String(node.attrs?.value ?? ""),

  renderText: ({ node }) => String(node.attrs.value ?? ""),
});
