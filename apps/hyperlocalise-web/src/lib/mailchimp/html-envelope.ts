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

import { applyHtmlIngestTranslations } from "@/lib/projects/files/html-ingest-entries";

import type { MailchimpResourceKind } from "./constants";
import { protectMailchimpMergeTags, restoreMailchimpMergeTags } from "./variables";

export const MAILCHIMP_FIELD_ATTR = "data-hl-mailchimp-field";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

function fieldBlock(name: string, value: string): string {
  return `<div ${MAILCHIMP_FIELD_ATTR}="${name}">${value}</div>`;
}

function readTitleField(html: string): string {
  const marked = new RegExp(
    `<title[^>]*${MAILCHIMP_FIELD_ATTR}="subject"[^>]*>([\\s\\S]*?)</title>`,
    "i",
  ).exec(html);
  if (marked?.[1] != null) {
    return marked[1];
  }
  return "";
}

function readMetaField(html: string, field: string): string {
  const tag = new RegExp(`<meta[^>]*${MAILCHIMP_FIELD_ATTR}="${field}"[^>]*>`, "i").exec(html)?.[0];
  if (!tag) {
    return "";
  }
  const content = /\scontent\s*=\s*"([^"]*)"/i.exec(tag) ?? /\scontent\s*=\s*'([^']*)'/i.exec(tag);
  return content?.[1] ?? "";
}

function readFieldInnerHtml(html: string, field: string): string {
  const open = new RegExp(`<div[^>]*${MAILCHIMP_FIELD_ATTR}="${field}"[^>]*>`, "i");
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
  return html.slice(start);
}

export function hashMailchimpContent(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type MailchimpContentEnvelope = {
  subject: string;
  previewText: string;
  fromName: string;
  htmlBody: string;
};

export function serializeMailchimpEnvelope(input: {
  subject: string;
  previewText?: string;
  fromName?: string;
  html: string;
}): { html: string; htmlTokens: string[] } {
  const subjectProtected = protectMailchimpMergeTags(input.subject);
  const previewProtected = protectMailchimpMergeTags(
    input.previewText ?? "",
    subjectProtected.tokens,
  );
  const fromProtected = protectMailchimpMergeTags(input.fromName ?? "", previewProtected.tokens);
  const htmlProtected = protectMailchimpMergeTags(input.html, fromProtected.tokens);

  const document = [
    "<!doctype html>",
    "<html><head>",
    `<title ${MAILCHIMP_FIELD_ATTR}="subject">${escapeHtml(subjectProtected.text)}</title>`,
    `<meta ${MAILCHIMP_FIELD_ATTR}="previewText" name="description" content="${escapeHtml(previewProtected.text)}">`,
    `<meta ${MAILCHIMP_FIELD_ATTR}="fromName" name="author" content="${escapeHtml(fromProtected.text)}">`,
    "</head><body>",
    // Raw HTML (like Braze/Customer.io) so ingest walks the email markup instead of one escaped blob.
    fieldBlock("htmlBody", htmlProtected.text),
    "</body></html>",
  ].join("");

  return { html: document, htmlTokens: htmlProtected.tokens };
}

export function parseMailchimpEnvelope(html: string): MailchimpContentEnvelope {
  return {
    subject: decodeHtml(readFieldInnerHtml(html, "subject") || readTitleField(html)),
    previewText: decodeHtml(
      readFieldInnerHtml(html, "previewText") || readMetaField(html, "previewText"),
    ),
    fromName: decodeHtml(readFieldInnerHtml(html, "fromName") || readMetaField(html, "fromName")),
    htmlBody: readFieldInnerHtml(html, "htmlBody"),
  };
}

/** Restore Mailchimp merge tags on push using tokens captured at import. */
export function restoreMailchimpEnvelopeForPush(
  envelope: MailchimpContentEnvelope,
  htmlMergeTokens: readonly string[],
): MailchimpContentEnvelope {
  const tokens = [...htmlMergeTokens];
  return {
    subject: restoreMailchimpMergeTags(envelope.subject, tokens),
    previewText: restoreMailchimpMergeTags(envelope.previewText, tokens),
    fromName: restoreMailchimpMergeTags(envelope.fromName, tokens),
    htmlBody: restoreMailchimpMergeTags(envelope.htmlBody, tokens),
  };
}

export type MailchimpRemoteCopyFields = {
  subject?: string;
  previewText?: string;
  fromName?: string;
  html?: string;
};

/**
 * Rebuild the stored envelope shape from a live Mailchimp locale copy so
 * HTML ingest keys stay stable when applying a partial approval.
 */
export function serializeMailchimpRemoteEnvelope(input: {
  storedEnvelopeHtml: string;
  remote: MailchimpRemoteCopyFields;
}): { html: string; htmlTokens: string[] } {
  const stored = parseMailchimpEnvelope(input.storedEnvelopeHtml);
  return serializeMailchimpEnvelope({
    subject: input.remote.subject ?? stored.subject,
    previewText: input.remote.previewText ?? stored.previewText,
    fromName: input.remote.fromName ?? stored.fromName,
    html: input.remote.html?.trim() ? input.remote.html : stored.htmlBody,
  });
}

function restoreApprovedMailchimpTranslations(
  approved: Record<string, string>,
  sourceMergeTokens: readonly string[],
): Record<string, string> {
  if (sourceMergeTokens.length === 0) {
    return approved;
  }
  const tokens = [...sourceMergeTokens];
  return Object.fromEntries(
    Object.entries(approved).map(([key, value]) => [key, restoreMailchimpMergeTags(value, tokens)]),
  );
}

/**
 * Apply approved HTML ingest keys onto the remote locale copy when present.
 * Unapproved nodes then keep the existing Mailchimp copy instead of falling
 * back to source language and overwriting it.
 *
 * New copies use the stored source envelope. Approved values are restored
 * with source merge tokens before they are applied onto a freshly serialized
 * remote envelope, so `*|MERGE|*` tags stay stable.
 */
export function applyApprovedMailchimpEnvelope(input: {
  storedEnvelopeHtml: string;
  remoteEnvelopeHtml?: string | null;
  approved: Record<string, string>;
  sourceMergeTokens?: readonly string[];
}): MailchimpContentEnvelope {
  const remoteEnvelopeHtml = input.remoteEnvelopeHtml?.trim() ? input.remoteEnvelopeHtml : null;
  const envelopeHtml = remoteEnvelopeHtml ?? input.storedEnvelopeHtml;
  const approved = remoteEnvelopeHtml
    ? restoreApprovedMailchimpTranslations(input.approved, input.sourceMergeTokens ?? [])
    : input.approved;
  return parseMailchimpEnvelope(applyHtmlIngestTranslations(envelopeHtml, approved));
}

/** Merge approved keys then restore merge tags for a Mailchimp write. */
export function buildMailchimpPushEnvelope(input: {
  storedEnvelopeHtml: string;
  remoteEnvelope?: { html: string; htmlTokens: string[] } | null;
  approved: Record<string, string>;
  sourceMergeTokens: readonly string[];
}): MailchimpContentEnvelope {
  return restoreMailchimpEnvelopeForPush(
    applyApprovedMailchimpEnvelope({
      storedEnvelopeHtml: input.storedEnvelopeHtml,
      remoteEnvelopeHtml: input.remoteEnvelope?.html,
      approved: input.approved,
      sourceMergeTokens: input.sourceMergeTokens,
    }),
    input.remoteEnvelope?.htmlTokens ?? input.sourceMergeTokens,
  );
}

export function slugifyMailchimpPathSegment(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback.trim() || "item";
}

export function buildMailchimpSourcePath(input: {
  kind: MailchimpResourceKind;
  id: string;
  name: string;
}): string {
  const folder = input.kind === "campaign" ? "campaigns" : "templates";
  const slug = slugifyMailchimpPathSegment(input.name, input.id);
  return `mailchimp/${folder}/${input.id}/${slug}.html`;
}

export function isMailchimpSourcePath(sourcePath: string): boolean {
  return sourcePath === "mailchimp/" || sourcePath.startsWith("mailchimp/");
}
