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

export const DOCUMENT_CALLOUT_KINDS = ["note", "tip", "important", "warning", "caution"] as const;
export type DocumentCalloutKind = (typeof DOCUMENT_CALLOUT_KINDS)[number];

const ALERT_PATTERN =
  /^ {0,3}> ?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n((?: {0,3}>[^\n]*(?:\n|$))*)/i;
const INTERCOM_CALLOUT_PATTERN = /^ {0,3}:::callout\b([^\n]*)\n([\s\S]*?)^ {0,3}:::[ \t]*(?:\n|$)/m;

function readQuotedAttr(source: string, name: string) {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(source);
  return match?.[1] ?? null;
}

function firstTokenizerIndex(src: string, patterns: readonly RegExp[]) {
  let earliest = -1;
  for (const pattern of patterns) {
    const match = pattern.exec(src);
    if (match && (earliest === -1 || match.index < earliest)) {
      earliest = match.index;
    }
  }
  return earliest;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (kind?: DocumentCalloutKind) => ReturnType;
    };
  }
}

/** GitHub alert blocks: `> [!NOTE]` followed by quoted lines. */
export const DocumentCallout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      kind: {
        default: "note",
        parseHTML: (element) => element.getAttribute("data-callout") ?? "note",
      },
      backgroundColor: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-background-color"),
      },
      borderColor: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-border-color"),
      },
    };
  },

  parseHTML() {
    return [{ tag: "aside[data-callout]" }];
  },

  renderHTML({ node }) {
    return [
      "aside",
      {
        "data-callout": node.attrs.kind,
        ...(node.attrs.backgroundColor
          ? { "data-background-color": node.attrs.backgroundColor }
          : {}),
        ...(node.attrs.borderColor ? { "data-border-color": node.attrs.borderColor } : {}),
      },
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (kind = "note") =>
        ({ commands }) =>
          commands.wrapIn(this.name, { kind }),
    };
  },

  markdownTokenName: "callout",

  markdownTokenizer: {
    name: "callout",
    level: "block",
    start: (src: string) => firstTokenizerIndex(src, [/^ {0,3}> ?\[!/m, /^ {0,3}:::callout\b/m]),
    tokenize: (src: string, _tokens, lexer) => {
      const intercom = INTERCOM_CALLOUT_PATTERN.exec(src);
      if (intercom && intercom.index === 0) {
        const body = (intercom[2] ?? "").replace(/\n$/, "").trim();
        return {
          type: "callout",
          raw: intercom[0],
          kind: "note",
          backgroundColor: readQuotedAttr(intercom[1] ?? "", "backgroundColor"),
          borderColor: readQuotedAttr(intercom[1] ?? "", "borderColor"),
          tokens: body ? lexer.blockTokens(body) : [],
        };
      }
      const match = ALERT_PATTERN.exec(src);
      if (!match || match.index !== 0) {
        return undefined;
      }
      const body = match[2]
        .split("\n")
        .map((line) => line.replace(/^ {0,3}> ?/, ""))
        .join("\n")
        .trim();
      return {
        type: "callout",
        raw: match[0],
        kind: match[1].toLowerCase(),
        tokens: body ? lexer.blockTokens(body) : [],
      };
    },
  },

  parseMarkdown: (token: MarkdownToken, helpers) => {
    const children = helpers.parseChildren(token.tokens ?? []);
    return helpers.createNode(
      "callout",
      {
        kind: token.kind ?? "note",
        backgroundColor: token.backgroundColor ?? null,
        borderColor: token.borderColor ?? null,
      },
      children.length > 0 ? children : [{ type: "paragraph" }],
    );
  },

  renderMarkdown: (node: JSONContent, helpers) => {
    const body = helpers.renderChildren(node.content ?? [], "\n\n").trim();
    const backgroundColor =
      typeof node.attrs?.backgroundColor === "string" ? node.attrs.backgroundColor : "";
    const borderColor = typeof node.attrs?.borderColor === "string" ? node.attrs.borderColor : "";
    if (backgroundColor || borderColor) {
      const attrs = [
        backgroundColor ? `backgroundColor="${backgroundColor}"` : "",
        borderColor ? `borderColor="${borderColor}"` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `:::callout ${attrs}\n${body}\n:::`;
    }
    const kind = String(node.attrs?.kind ?? "note").toUpperCase();
    const quoted = body
      .split("\n")
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n");
    return `> [!${kind}]\n${quoted}`;
  },
});
