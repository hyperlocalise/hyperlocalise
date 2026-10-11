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

import { normalizeSourcePath } from "@/lib/file-storage/records";

import { protectBrazeLiquidFields, restoreBrazeLiquidFields } from "./liquid";
import { slugifyBrazePathSegment } from "./names";

export type BrazeEmailEnvelope = {
  subject: string;
  preheader?: string;
  body: string;
  plaintext_body?: string;
};

export type BrazeContentBlockEnvelope = {
  content: string;
};

const FIELD_ATTR = "data-hl-braze-field";

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

export function serializeBrazeEmailEnvelope(fields: BrazeEmailEnvelope): {
  html: string;
  tokensByField: Partial<Record<keyof BrazeEmailEnvelope, string[]>>;
} {
  const protectedFields = protectBrazeLiquidFields({
    subject: fields.subject,
    preheader: fields.preheader ?? "",
    body: fields.body,
    plaintext_body: fields.plaintext_body ?? "",
  });
  return {
    html: [
      "<!doctype html>",
      "<html><body>",
      fieldBlock("subject", escapeHtml(protectedFields.fields.subject ?? "")),
      fieldBlock("preheader", escapeHtml(protectedFields.fields.preheader ?? "")),
      fieldBlock("body", protectedFields.fields.body ?? ""),
      fieldBlock("plaintext_body", escapeHtml(protectedFields.fields.plaintext_body ?? "")),
      "</body></html>",
    ].join(""),
    tokensByField: protectedFields.tokensByField,
  };
}

export function serializeBrazeContentBlockEnvelope(fields: BrazeContentBlockEnvelope): {
  html: string;
  tokensByField: Partial<Record<keyof BrazeContentBlockEnvelope, string[]>>;
} {
  const protectedFields = protectBrazeLiquidFields({ content: fields.content });
  return {
    html: [
      "<!doctype html>",
      "<html><body>",
      fieldBlock("content", protectedFields.fields.content ?? ""),
      "</body></html>",
    ].join(""),
    tokensByField: protectedFields.tokensByField,
  };
}

function readFieldInnerHtml(html: string, field: string): string {
  const pattern = new RegExp(`<div[^>]*${FIELD_ATTR}="${field}"[^>]*>([\\s\\S]*?)</div>`, "i");
  const match = html.match(pattern);
  return match?.[1] ?? "";
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

export function parseBrazeEmailEnvelope(html: string): BrazeEmailEnvelope {
  return {
    subject: decodeHtml(readFieldInnerHtml(html, "subject")),
    preheader: decodeHtml(readFieldInnerHtml(html, "preheader")) || undefined,
    body: readFieldInnerHtml(html, "body"),
    plaintext_body: decodeHtml(readFieldInnerHtml(html, "plaintext_body")) || undefined,
  };
}

export function parseBrazeContentBlockEnvelope(html: string): BrazeContentBlockEnvelope {
  return { content: readFieldInnerHtml(html, "content") };
}

export function restoreBrazeEmailEnvelope(
  fields: BrazeEmailEnvelope,
  tokensByField: Partial<Record<keyof BrazeEmailEnvelope, string[]>>,
): BrazeEmailEnvelope {
  const restored = restoreBrazeLiquidFields(
    {
      subject: fields.subject,
      preheader: fields.preheader ?? "",
      body: fields.body,
      plaintext_body: fields.plaintext_body ?? "",
    },
    tokensByField,
  );
  return {
    subject: restored.subject,
    preheader: restored.preheader || undefined,
    body: restored.body,
    plaintext_body: restored.plaintext_body || undefined,
  };
}

export function restoreBrazeContentBlockEnvelope(
  fields: BrazeContentBlockEnvelope,
  tokensByField: Partial<Record<keyof BrazeContentBlockEnvelope, string[]>>,
): BrazeContentBlockEnvelope {
  return restoreBrazeLiquidFields(fields, tokensByField);
}

export function hashBrazeContent(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildBrazeEmailSourcePath(input: {
  templateId: string;
  templateName?: string | null;
}): string {
  const slug = slugifyBrazePathSegment(input.templateName ?? "", input.templateId);
  return normalizeSourcePath(`braze/templates/${slug}.html`);
}

export function buildBrazeContentBlockSourcePath(input: {
  contentBlockId: string;
  name?: string | null;
}): string {
  const slug = slugifyBrazePathSegment(input.name ?? "", input.contentBlockId);
  return normalizeSourcePath(`braze/content-blocks/${slug}.html`);
}
