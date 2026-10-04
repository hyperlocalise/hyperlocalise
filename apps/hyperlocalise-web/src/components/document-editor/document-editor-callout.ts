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
    };
  },

  parseHTML() {
    return [{ tag: "aside[data-callout]" }];
  },

  renderHTML({ node }) {
    return ["aside", { "data-callout": node.attrs.kind }, 0];
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
    start: (src: string) => {
      const match = /^ {0,3}> ?\[!/m.exec(src);
      return match ? match.index : -1;
    },
    tokenize: (src: string, _tokens, lexer) => {
      const match = ALERT_PATTERN.exec(src);
      if (!match) {
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
      { kind: token.kind },
      children.length > 0 ? children : [{ type: "paragraph" }],
    );
  },

  renderMarkdown: (node: JSONContent, helpers) => {
    const kind = String(node.attrs?.kind ?? "note").toUpperCase();
    const body = helpers
      .renderChildren(node.content ?? [], "\n\n")
      .trim()
      .split("\n")
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n");
    return `> [!${kind}]\n${body}`;
  },
});
