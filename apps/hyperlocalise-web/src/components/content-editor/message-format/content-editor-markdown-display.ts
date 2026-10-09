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

import { stripIntercomHeadingId } from "@/components/document-editor/document-editor-heading";

import { extractInternalMarkupSpans } from "./content-editor-internal-markup";
import {
  collectStandardMarkdownDelimiters,
  formatMarkdownMarkupForDisplay,
  recoverMarkdownMarkupTokens,
  type MarkdownMarkupDisplayOptions,
} from "./content-editor-markdown-markup";

export type ContentEditorMarkdownDisplaySpan =
  | { type: "text"; text: string }
  | { type: "link"; label: string; href: string; image: boolean };

export type ContentEditorMarkdownDisplayModel = {
  spans: ContentEditorMarkdownDisplaySpan[];
  headingId: string | null;
  visibleText: string;
};

const HEADING_ID_LITERAL = /^\{#[A-Za-z][\w:-]*\}$/;

function markdownSpans(message: string) {
  return extractInternalMarkupSpans(message).filter((span) => span.family === "MD");
}

export function isStructuralMarkdownLiteral(literal: string): boolean {
  return (
    literal === "[" ||
    literal === "![" ||
    literal.startsWith("](") ||
    literal.startsWith("][") ||
    HEADING_ID_LITERAL.test(literal)
  );
}

export function shouldUseMarkdownCatDisplay(message: string, companion?: string): boolean {
  return (
    markdownSpans(message).length > 0 ||
    markdownSpans(companion ?? "").length > 0 ||
    collectStandardMarkdownDelimiters(message).length > 0 ||
    collectStandardMarkdownDelimiters(companion ?? "").length > 0
  );
}

export function expandMarkdownCatMarkup(
  message: string,
  companion?: string,
  options?: MarkdownMarkupDisplayOptions,
): string {
  return formatMarkdownMarkupForDisplay(message, companion, options);
}

export function sourceHeadingIdLiteral(sourceText: string, companion?: string): string | null {
  const expanded = expandMarkdownCatMarkup(sourceText, companion);
  const fromExpanded = stripIntercomHeadingId(expanded);
  if (fromExpanded.id) {
    return `{#${fromExpanded.id}}`;
  }

  const raw = stripIntercomHeadingId(sourceText);
  if (raw.id) {
    return `{#${raw.id}}`;
  }

  const tokens = markdownSpans(sourceText);
  const last = tokens.at(-1);
  if (
    last &&
    sourceText.slice(last.end).trim() === "" &&
    tokens.length % 2 === 1 &&
    last.family === "MD"
  ) {
    return last.literal;
  }
  return null;
}

export function isStructuralMarkdownMarkupToken(
  token: { kind: string; start: number },
  sourceText: string,
  companion?: string,
): boolean {
  if (token.kind !== "markup") {
    return false;
  }
  const tokens = markdownSpans(sourceText);
  const index = tokens.findIndex((span) => span.start === token.start);
  if (index < 0) {
    return false;
  }
  const expanded = expandMarkdownCatMarkup(sourceText, companion);
  const delimiters = collectStandardMarkdownDelimiters(expanded);
  if (delimiters.length === tokens.length) {
    return isStructuralMarkdownLiteral(delimiters[index]?.literal ?? "");
  }
  return true;
}

function linkHrefFromCloser(literal: string): string {
  if (literal.startsWith("](") && literal.endsWith(")")) {
    return literal.slice(2, -1);
  }
  if (literal.startsWith("][") && literal.endsWith("]")) {
    return literal.slice(2, -1);
  }
  return "";
}

function parseMarkdownLinkSpans(text: string): ContentEditorMarkdownDisplaySpan[] {
  const delimiters = collectStandardMarkdownDelimiters(text);
  const spans: ContentEditorMarkdownDisplaySpan[] = [];
  let cursor = 0;
  let index = 0;

  while (index < delimiters.length) {
    const opener = delimiters[index]!;
    const closer = delimiters[index + 1];
    const isOpener = opener.literal === "[" || opener.literal === "![";
    const isCloser =
      closer != null && (closer.literal.startsWith("](") || closer.literal.startsWith("]["));
    if (isOpener && isCloser) {
      if (opener.start > cursor) {
        spans.push({ type: "text", text: text.slice(cursor, opener.start) });
      }
      spans.push({
        type: "link",
        label: text.slice(opener.end, closer.start),
        href: linkHrefFromCloser(closer.literal),
        image: opener.literal === "![",
      });
      cursor = closer.end;
      index += 2;
      continue;
    }
    index += 1;
  }

  if (cursor < text.length) {
    spans.push({ type: "text", text: text.slice(cursor) });
  }
  if (spans.length === 0 && text.length > 0) {
    spans.push({ type: "text", text });
  }
  return spans;
}

function stripStructuralMarkdownSentinels(text: string, companion?: string): string {
  const tokens = markdownSpans(text);
  if (tokens.length === 0) {
    return text;
  }
  const expanded = expandMarkdownCatMarkup(text, companion);
  const delimiters = collectStandardMarkdownDelimiters(expanded);
  let next = text;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index]!;
    const literal = delimiters.length === tokens.length ? (delimiters[index]?.literal ?? "") : "";
    if (literal ? isStructuralMarkdownLiteral(literal) : true) {
      next = `${next.slice(0, token.start)}${next.slice(token.end)}`;
    }
  }
  return next;
}

function visibleTextFromSpans(spans: ContentEditorMarkdownDisplaySpan[]): string {
  return spans.map((span) => (span.type === "text" ? span.text : span.label)).join("");
}

export function markdownDisplayModel(
  message: string,
  companion?: string,
  options?: MarkdownMarkupDisplayOptions,
): ContentEditorMarkdownDisplayModel {
  const expanded = expandMarkdownCatMarkup(message, companion, options);
  const heading = stripIntercomHeadingId(expanded);
  const linkReady = parseMarkdownLinkSpans(heading.text).map((span) =>
    span.type === "text"
      ? { ...span, text: stripStructuralMarkdownSentinels(span.text, companion) }
      : span,
  );
  const spans =
    linkReady.length > 0
      ? linkReady
      : [
          {
            type: "text" as const,
            text: stripStructuralMarkdownSentinels(heading.text, companion),
          },
        ];

  return {
    spans,
    headingId: heading.id,
    visibleText: visibleTextFromSpans(spans),
  };
}

export function serializeMarkdownDisplaySpans(spans: ContentEditorMarkdownDisplaySpan[]): string {
  return spans
    .map((span) => {
      if (span.type === "text") {
        return span.text;
      }
      return span.image ? `![${span.label}](${span.href})` : `[${span.label}](${span.href})`;
    })
    .join("");
}

export function reattachMarkdownHeadingId(text: string, headingLiteral: string | null): string {
  if (!headingLiteral) {
    return text;
  }
  const stripped = stripIntercomHeadingId(text).text.replace(/\s+$/, "");
  if (!stripped) {
    return text;
  }
  return `${stripped} ${headingLiteral}`;
}

export function canUseMarkdownCatEditor(message: string, companion?: string): boolean {
  const direct = markdownDisplayModel(message, companion);
  if (direct.spans.some((span) => span.type === "link") || direct.headingId) {
    return true;
  }
  if (
    shouldUseMarkdownCatDisplay(message, companion) &&
    markdownSpans(message).length > 0 &&
    markdownSpans(message).length === markdownSpans(companion ?? "").length
  ) {
    return true;
  }
  const swapped = markdownDisplayModel(companion ?? "", message);
  return (
    swapped.spans.some((span) => span.type === "link") ||
    sourceHeadingIdLiteral(message, companion) != null
  );
}

export function persistMarkdownCatTarget(
  sourceText: string,
  serializedDisplay: string,
  headingLiteral?: string | null,
): string {
  const heading = headingLiteral ?? sourceHeadingIdLiteral(sourceText, serializedDisplay);
  const withHeading = reattachMarkdownHeadingId(serializedDisplay, heading);
  return recoverMarkdownMarkupTokens(sourceText, withHeading) ?? withHeading;
}

export type MarkdownEditorDoc = {
  type?: string;
  text?: string;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: MarkdownEditorDoc[];
};

export function markdownDisplayDocFromModel(model: ContentEditorMarkdownDisplayModel): {
  type: "doc";
  content: Array<{ type: "paragraph"; content?: MarkdownEditorDoc[] }>;
} {
  const content: MarkdownEditorDoc[] = [];
  for (const span of model.spans) {
    if (span.type === "text") {
      if (span.text) {
        content.push({ type: "text", text: span.text });
      }
      continue;
    }
    if (!span.label) {
      continue;
    }
    content.push({
      type: "text",
      text: span.label,
      marks: [
        {
          type: "link",
          attrs: {
            href: span.href,
            target: null,
            ...(span.image ? { class: "cat-md-image" } : {}),
          },
        },
      ],
    });
  }
  return {
    type: "doc",
    content: [{ type: "paragraph", content: content.length > 0 ? content : undefined }],
  };
}

function linkMarkFromNode(node: MarkdownEditorDoc): { href: string; image: boolean } | null {
  const mark = node.marks?.find((item) => item.type === "link");
  if (!mark || typeof mark.attrs?.href !== "string") {
    return null;
  }
  return {
    href: mark.attrs.href,
    image: mark.attrs.class === "cat-md-image",
  };
}

export function markdownSpansFromEditorDoc(
  doc: MarkdownEditorDoc,
): ContentEditorMarkdownDisplaySpan[] {
  const spans: ContentEditorMarkdownDisplaySpan[] = [];

  function appendText(text: string) {
    const last = spans.at(-1);
    if (last?.type === "text") {
      last.text += text;
      return;
    }
    spans.push({ type: "text", text });
  }

  function appendLink(label: string, href: string, image: boolean) {
    const last = spans.at(-1);
    if (last?.type === "link" && last.href === href && last.image === image) {
      last.label += label;
      return;
    }
    spans.push({ type: "link", label, href, image });
  }

  function walk(node: MarkdownEditorDoc, paragraphIndex: number) {
    if (node.type === "text") {
      const link = linkMarkFromNode(node);
      const text = node.text ?? "";
      if (link) {
        appendLink(text, link.href, link.image);
      } else if (text) {
        appendText(text);
      }
      return;
    }

    const children = node.content ?? [];
    if (node.type === "paragraph" && paragraphIndex > 0) {
      appendText("\n");
    }
    children.forEach((child, index) => {
      walk(child, node.type === "doc" ? index : paragraphIndex);
    });
  }

  walk(doc, 0);
  return spans;
}

export function serializeMarkdownEditorDoc(doc: MarkdownEditorDoc): string {
  return serializeMarkdownDisplaySpans(markdownSpansFromEditorDoc(doc));
}
