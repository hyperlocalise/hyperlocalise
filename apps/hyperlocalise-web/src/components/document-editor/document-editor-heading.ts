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
import { type JSONContent, type MarkdownToken } from "@tiptap/core";
import { Heading } from "@tiptap/extension-heading";

export const INTERCOM_HEADING_ID_PATTERN = /\s*\{#([A-Za-z][\w:-]*)\}\s*$/;

export function stripIntercomHeadingId(text: string): { text: string; id: string | null } {
  const match = INTERCOM_HEADING_ID_PATTERN.exec(text);
  if (!match) {
    return { text, id: null };
  }
  return { text: text.slice(0, match.index), id: match[1] ?? null };
}

function stripIntercomHeadingIdFromContent(content: JSONContent[]): {
  content: JSONContent[];
  id: string | null;
} {
  if (content.length === 0) {
    return { content, id: null };
  }
  const last = content.at(-1);
  if (last?.type !== "text" || typeof last.text !== "string") {
    return { content, id: null };
  }
  const stripped = stripIntercomHeadingId(last.text);
  if (!stripped.id) {
    return { content, id: null };
  }
  const next = content.slice(0, -1);
  if (stripped.text) {
    next.push({ ...last, text: stripped.text });
  }
  return { content: next, id: stripped.id };
}

/** ATX headings that keep Intercom `{#h_…}` ids on serialize and hide them in the editor. */
export const DocumentHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("id"),
        renderHTML: (attributes) => (attributes.id ? { id: String(attributes.id) } : {}),
      },
    };
  },

  parseMarkdown: (token: MarkdownToken, helpers) => {
    const children = helpers.parseInline(token.tokens ?? []);
    const { content, id } = stripIntercomHeadingIdFromContent(children);
    return helpers.createNode(
      "heading",
      { level: token.depth ?? 1, id },
      content.length > 0 ? content : [helpers.createTextNode("")],
    );
  },

  renderMarkdown: (node: JSONContent, helpers) => {
    const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 4);
    const body = helpers.renderChildren(node.content ?? []).trim();
    const id = typeof node.attrs?.id === "string" && node.attrs.id ? ` {#${node.attrs.id}}` : "";
    return `${"#".repeat(level)} ${body}${id}`;
  },
});
