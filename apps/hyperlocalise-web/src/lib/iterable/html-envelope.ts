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
import { createHash } from "node:crypto";

import {
  applyHtmlIngestTranslations,
  extractHtmlIngestEntries,
} from "@/lib/projects/files/html-ingest-entries";

import { protectIterableHandlebarsFields, restoreIterableHandlebarsFields } from "./handlebars";

const FIELD_ATTR = "data-hl-iterable-field";

export type IterableEmailEnvelope = {
  subject: string;
  preheaderText?: string;
  html: string;
  plainText?: string;
};

export type IterableInAppEnvelope = {
  html: string;
  title?: string;
  subtitle?: string;
  icon?: string;
};

export type IterablePushEnvelope = {
  title: string;
  message: string;
};

export type IterableSmsEnvelope = {
  message: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fieldBlock(name: string, value: string): string {
  return `<div ${FIELD_ATTR}="${name}">${value}</div>`;
}

export function serializeIterableEmailEnvelope(fields: IterableEmailEnvelope): {
  html: string;
  tokensByField: Partial<Record<keyof IterableEmailEnvelope, string[]>>;
} {
  const protectedFields = protectIterableHandlebarsFields({
    subject: fields.subject,
    preheaderText: fields.preheaderText ?? "",
    html: fields.html,
    plainText: fields.plainText ?? "",
  });
  return {
    html: [
      "<!doctype html>",
      "<html><body>",
      fieldBlock("subject", escapeHtml(protectedFields.fields.subject ?? "")),
      fieldBlock("preheaderText", escapeHtml(protectedFields.fields.preheaderText ?? "")),
      fieldBlock("html", protectedFields.fields.html ?? ""),
      fieldBlock("plainText", escapeHtml(protectedFields.fields.plainText ?? "")),
      "</body></html>",
    ].join(""),
    tokensByField: protectedFields.tokensByField,
  };
}

export function serializeIterableInAppEnvelope(fields: IterableInAppEnvelope): {
  html: string;
  tokensByField: Partial<Record<keyof IterableInAppEnvelope, string[]>>;
} {
  const protectedFields = protectIterableHandlebarsFields({
    html: fields.html,
    title: fields.title ?? "",
    subtitle: fields.subtitle ?? "",
    icon: fields.icon ?? "",
  });
  return {
    html: [
      "<!doctype html>",
      "<html><body>",
      fieldBlock("title", escapeHtml(protectedFields.fields.title ?? "")),
      fieldBlock("subtitle", escapeHtml(protectedFields.fields.subtitle ?? "")),
      fieldBlock("icon", escapeHtml(protectedFields.fields.icon ?? "")),
      fieldBlock("html", protectedFields.fields.html ?? ""),
      "</body></html>",
    ].join(""),
    tokensByField: protectedFields.tokensByField,
  };
}

export function serializeIterableSnippetHtml(content: string): {
  html: string;
  tokensByField: { content: string[] };
} {
  const protectedField = protectIterableHandlebarsFields({ content });
  return {
    html: [
      "<!doctype html>",
      "<html><body>",
      fieldBlock("content", protectedField.fields.content ?? ""),
      "</body></html>",
    ].join(""),
    tokensByField: { content: protectedField.tokensByField.content ?? [] },
  };
}

function readFieldInnerHtml(html: string, field: string): string {
  const open = new RegExp(`<div[^>]*${FIELD_ATTR}="${field}"[^>]*>`, "i");
  const match = open.exec(html);
  if (!match) {
    return "";
  }
  const start = match.index + match[0].length;
  const tag = /<\/?div\b[^>]*>/gi;
  tag.lastIndex = start;
  let depth = 1;
  let found = tag.exec(html);
  while (found) {
    const isClose = found[0].startsWith("</");
    depth += isClose ? -1 : 1;
    if (depth === 0) {
      return html.slice(start, found.index);
    }
    found = tag.exec(html);
  }
  return "";
}

function unescapeHtml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

export function parseIterableEmailEnvelope(html: string): IterableEmailEnvelope {
  return {
    subject: unescapeHtml(readFieldInnerHtml(html, "subject")),
    preheaderText: unescapeHtml(readFieldInnerHtml(html, "preheaderText")),
    html: readFieldInnerHtml(html, "html"),
    plainText: unescapeHtml(readFieldInnerHtml(html, "plainText")),
  };
}

export function parseIterableInAppEnvelope(html: string): IterableInAppEnvelope {
  return {
    title: unescapeHtml(readFieldInnerHtml(html, "title")),
    subtitle: unescapeHtml(readFieldInnerHtml(html, "subtitle")),
    icon: unescapeHtml(readFieldInnerHtml(html, "icon")),
    html: readFieldInnerHtml(html, "html"),
  };
}

export function parseIterableSnippetHtml(html: string): string {
  return readFieldInnerHtml(html, "content");
}

export function restoreIterableEmailEnvelope(
  fields: IterableEmailEnvelope,
  tokensByField: Partial<Record<keyof IterableEmailEnvelope, string[]>>,
): IterableEmailEnvelope {
  return restoreIterableHandlebarsFields(fields, tokensByField);
}

export function restoreIterableInAppEnvelope(
  fields: IterableInAppEnvelope,
  tokensByField: Partial<Record<keyof IterableInAppEnvelope, string[]>>,
): IterableInAppEnvelope {
  return restoreIterableHandlebarsFields(fields, tokensByField);
}

export function restoreIterableSnippetContent(
  content: string,
  tokens: string[] | undefined,
): string {
  return restoreIterableHandlebarsFields({ content }, { content: tokens }).content ?? content;
}

export function serializeIterablePushEnvelope(fields: IterablePushEnvelope): string {
  return JSON.stringify({ title: fields.title, message: fields.message }, null, 2);
}

export function serializeIterableSmsEnvelope(fields: IterableSmsEnvelope): string {
  return JSON.stringify({ message: fields.message }, null, 2);
}

export function parseIterablePushEnvelope(json: string): IterablePushEnvelope {
  const parsed = JSON.parse(json) as IterablePushEnvelope;
  return { title: parsed.title ?? "", message: parsed.message ?? "" };
}

export function parseIterableSmsEnvelope(json: string): IterableSmsEnvelope {
  const parsed = JSON.parse(json) as IterableSmsEnvelope;
  return { message: parsed.message ?? "" };
}

export function hashIterableContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function applyApprovedIterableHtmlTranslations(
  sourceHtml: string,
  prefilled: Record<string, string>,
): string {
  return applyHtmlIngestTranslations(sourceHtml, prefilled);
}

export function seedEntriesForIterableHtml(_sourcePath: string, html: string) {
  return extractHtmlIngestEntries(html);
}
