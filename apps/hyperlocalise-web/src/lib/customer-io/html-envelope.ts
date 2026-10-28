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

import { extractHtmlIngestEntries } from "@/lib/projects/files/html-ingest-entries";

import { normalizeSourcePath } from "./source-path";

/**
 * HTML envelope for Customer.io email actions (mirrors the Braze email
 * envelope convention). The body stays raw HTML; subject and preheader are
 * escaped text. Each field is a `<div data-hl-customer-io-field="…">` block in
 * `<body>` so the HTML ingest pipeline extracts it — `<head>` content is
 * skipped on ingest, so `<title>`/`<meta>` storage would never reach Jobs.
 *
 * Liquid (`{{ }}`, `{% %}`) is intentionally left inline, matching the
 * existing JSON translation-map behavior. Tokenized protection would need
 * sync state to restore on push, and this integration is stateless by design.
 */
export type CustomerIoEmailEnvelope = {
  subject: string;
  preheader_text?: string;
  body: string;
};

/**
 * Action types stored as HTML envelopes (raw HTML body plus subject/preheader
 * field blocks for the HTML ingest pipeline). `in_app` carries an HTML body
 * like email; all other localizable types use the JSON translation map.
 */
export function isCustomerIoHtmlActionType(type: string): boolean {
  const normalized = type.trim().toLowerCase();
  return normalized === "email" || normalized === "in_app";
}

const FIELD_ATTR = "data-hl-customer-io-field";

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

export function serializeCustomerIoEmailEnvelope(fields: CustomerIoEmailEnvelope): string {
  return [
    "<!doctype html>",
    "<html><body>",
    fieldBlock("subject", escapeHtml(fields.subject)),
    fieldBlock("preheader_text", escapeHtml(fields.preheader_text ?? "")),
    fieldBlock("body", fields.body),
    "</body></html>",
  ].join("");
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
  return html.slice(start);
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

export function parseCustomerIoEmailEnvelope(html: string): CustomerIoEmailEnvelope {
  return {
    subject: decodeHtml(readFieldInnerHtml(html, "subject")),
    preheader_text: decodeHtml(readFieldInnerHtml(html, "preheader_text")) || undefined,
    body: readFieldInnerHtml(html, "body"),
  };
}

export function hashCustomerIoEmailEnvelope(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

/**
 * Seedable email fields for approved-import. The body holds many HTML text
 * nodes that cannot be matched to a whole-body remote string, so only
 * single-text fields seed — and only on an exact, unique entry-text match
 * (SRX splits or duplicates safely yield nothing).
 */
const SEEDABLE_EMAIL_FIELDS = ["subject", "preheader_text"] as const;

export function seedEntriesForCustomerIoEmailFields(input: {
  sourceHtml: string;
  sourceMap: Record<string, string>;
  remoteMap: Record<string, string>;
}): Record<string, string> {
  const entries = extractHtmlIngestEntries(input.sourceHtml);
  const seeded: Record<string, string> = {};
  for (const field of SEEDABLE_EMAIL_FIELDS) {
    const sourceText = input.sourceMap[field]?.trim();
    const remoteText = input.remoteMap[field]?.trim();
    if (!sourceText || !remoteText) {
      continue;
    }
    const matches = Object.entries(entries).filter(([, text]) => text.trim() === sourceText);
    if (matches.length === 1 && matches[0]) {
      seeded[matches[0][0]] = remoteText;
    }
  }
  return seeded;
}

export function buildCustomerIoEmailSourcePath(input: {
  kind: "broadcasts" | "campaigns" | "newsletters" | "transactional";
  resourceId: string;
  actionId: string;
}): string {
  const resourceSegment = input.resourceId.trim() || input.kind.slice(0, -1);
  const actionSegment = input.actionId.trim() || "action";
  const container =
    input.kind === "broadcasts" || input.kind === "campaigns" ? "actions" : "contents";
  return normalizeSourcePath(
    `customer-io/${input.kind}/${resourceSegment}/${container}/${actionSegment}.html`,
  );
}
