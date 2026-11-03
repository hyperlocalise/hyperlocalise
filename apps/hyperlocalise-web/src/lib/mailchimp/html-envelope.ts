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
  const previewProtected = protectMailchimpMergeTags(input.previewText ?? "");
  const fromProtected = protectMailchimpMergeTags(input.fromName ?? "");
  const htmlProtected = protectMailchimpMergeTags(input.html);

  const document = [
    "<!doctype html>",
    "<html><body>",
    fieldBlock("subject", escapeHtml(subjectProtected.text)),
    fieldBlock("previewText", escapeHtml(previewProtected.text)),
    fieldBlock("fromName", escapeHtml(fromProtected.text)),
    fieldBlock("htmlBody", escapeHtml(htmlProtected.text)),
    "</body></html>",
  ].join("");

  return { html: document, htmlTokens: htmlProtected.tokens };
}

function readProtectedField(html: string, field: string): { raw: string; tokens: string[] } {
  const raw = decodeHtml(readFieldInnerHtml(html, field));
  const protectedField = protectMailchimpMergeTags(raw);
  return { raw, tokens: protectedField.tokens };
}

export function parseMailchimpEnvelope(html: string): MailchimpContentEnvelope {
  const subjectField = readProtectedField(html, "subject");
  const previewField = readProtectedField(html, "previewText");
  const fromField = readProtectedField(html, "fromName");
  const bodyField = readProtectedField(html, "htmlBody");

  return {
    subject: restoreMailchimpMergeTags(subjectField.raw, subjectField.tokens),
    previewText: restoreMailchimpMergeTags(previewField.raw, previewField.tokens),
    fromName: restoreMailchimpMergeTags(fromField.raw, fromField.tokens),
    htmlBody: restoreMailchimpMergeTags(bodyField.raw, bodyField.tokens),
  };
}

export function applyApprovedMailchimpEnvelope(
  storedHtml: string,
  approved: Record<string, string>,
): MailchimpContentEnvelope {
  return parseMailchimpEnvelope(applyHtmlIngestTranslations(storedHtml, approved));
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
