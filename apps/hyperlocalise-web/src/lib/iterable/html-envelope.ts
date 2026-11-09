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

/**
 * Apply approved HTML ingest keys onto the remote translation envelope, not
 * the stored source. Unapproved nodes then keep the existing Iterable copy
 * instead of falling back to source language and overwriting it.
 *
 * Keys come from the envelope structure (field blocks). Rebuilding the remote
 * map as the same envelope keeps those keys stable when the remote HTML still
 * matches the imported template.
 */
export function applyApprovedIterableHtmlTranslations(input: {
  storedEnvelopeHtml: string;
  remoteEnvelopeHtml?: string | null;
  approved: Record<string, string>;
}): string {
  const envelope = input.remoteEnvelopeHtml?.trim()
    ? input.remoteEnvelopeHtml
    : input.storedEnvelopeHtml;
  return applyHtmlIngestTranslations(envelope, input.approved);
}

export function serializeIterableEmailRemoteEnvelope(input: {
  storedEnvelopeHtml: string;
  remote?: Partial<IterableEmailEnvelope> | null;
}): ReturnType<typeof serializeIterableEmailEnvelope> {
  const stored = parseIterableEmailEnvelope(input.storedEnvelopeHtml);
  return serializeIterableEmailEnvelope({
    subject: input.remote?.subject ?? stored.subject,
    preheaderText: input.remote?.preheaderText ?? stored.preheaderText,
    html: input.remote?.html ?? stored.html,
    plainText: input.remote?.plainText ?? stored.plainText,
  });
}

export function serializeIterableInAppRemoteEnvelope(input: {
  storedEnvelopeHtml: string;
  remote?: Partial<IterableInAppEnvelope> | null;
}): ReturnType<typeof serializeIterableInAppEnvelope> {
  const stored = parseIterableInAppEnvelope(input.storedEnvelopeHtml);
  return serializeIterableInAppEnvelope({
    html: input.remote?.html ?? stored.html,
    title: input.remote?.title ?? stored.title,
    subtitle: input.remote?.subtitle ?? stored.subtitle,
    icon: input.remote?.icon ?? stored.icon,
  });
}

export function serializeIterableSnippetRemoteEnvelope(input: {
  storedEnvelopeHtml: string;
  remoteContent?: string | null;
}): ReturnType<typeof serializeIterableSnippetHtml> {
  const stored = parseIterableSnippetHtml(input.storedEnvelopeHtml);
  return serializeIterableSnippetHtml(input.remoteContent?.trim() ? input.remoteContent : stored);
}

function pickTranslatedField(
  approved: Record<string, string>,
  field: string,
  remote: string | undefined,
  source: string,
): string {
  const approvedValue = approved[field];
  if (typeof approvedValue === "string") {
    return approvedValue;
  }
  if (typeof remote === "string" && remote.length > 0) {
    return remote;
  }
  return source;
}

/** JSON merge: approved key, else remote, else source. Do not run HTML ingest. */
export function applyApprovedIterablePushTranslations(input: {
  source: IterablePushEnvelope;
  remote?: Partial<IterablePushEnvelope> | null;
  approved: Record<string, string>;
}): IterablePushEnvelope {
  return {
    title: pickTranslatedField(input.approved, "title", input.remote?.title, input.source.title),
    message: pickTranslatedField(
      input.approved,
      "message",
      input.remote?.message,
      input.source.message,
    ),
  };
}

export function applyApprovedIterableSmsTranslations(input: {
  source: IterableSmsEnvelope;
  remote?: Partial<IterableSmsEnvelope> | null;
  approved: Record<string, string>;
}): IterableSmsEnvelope {
  return {
    message: pickTranslatedField(
      input.approved,
      "message",
      input.remote?.message,
      input.source.message,
    ),
  };
}

export function seedEntriesForIterableHtml(_sourcePath: string, html: string) {
  return extractHtmlIngestEntries(html);
}
