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

import type { LoopsResourceKind } from "./constants";
import { protectLoopsVariables, restoreLoopsVariables } from "./variables";

export const LOOPS_FIELD_ATTR = "data-hl-loops-field";

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
  return `<div ${LOOPS_FIELD_ATTR}="${name}">${value}</div>`;
}

function readFieldInnerHtml(html: string, field: string): string {
  const open = new RegExp(`<div[^>]*${LOOPS_FIELD_ATTR}="${field}"[^>]*>`, "i");
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

/**
 * Extract translatable text runs from LMX. LMX is XML (`<Paragraph>Hi
 * {data.name}</Paragraph>`), so text lives between `>` and `<`. Whitespace-only
 * runs and runs without letters are skipped so pretty-printing stays stable.
 */
export function extractLoopsTextSegments(lmx: string): string[] {
  const segments: string[] = [];
  const re = />([^<>]+)</g;
  let match = re.exec(lmx);
  while (match) {
    const raw = match[1] ?? "";
    if (/[A-Za-zÀ-ÿ0-9]/.test(raw) && raw.trim().length > 0) {
      segments.push(raw);
    }
    match = re.exec(lmx);
  }
  return segments;
}

export function hashLoopsContent(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type LoopsEmailEnvelope = {
  subject: string;
  previewText?: string;
  segments: string[];
};

export function serializeLoopsEmailEnvelope(input: {
  subject: string;
  previewText?: string;
  lmx: string;
}): { html: string; segments: string[]; tokensBySegment: string[][] } {
  const segments = extractLoopsTextSegments(input.lmx);
  const tokensBySegment: string[][] = [];
  const blocks = [
    "<!doctype html>",
    "<html><body>",
    fieldBlock("subject", escapeHtml(protectLoopsVariables(input.subject).text)),
    fieldBlock("previewText", escapeHtml(protectLoopsVariables(input.previewText ?? "").text)),
  ];
  segments.forEach((segment, index) => {
    const protectedSegment = protectLoopsVariables(segment);
    tokensBySegment.push(protectedSegment.tokens);
    blocks.push(fieldBlock(`segment-${index}`, escapeHtml(protectedSegment.text)));
  });
  blocks.push("</body></html>");
  return { html: blocks.join(""), segments, tokensBySegment };
}

export function parseLoopsEmailEnvelope(html: string): LoopsEmailEnvelope {
  const subject = decodeHtml(readFieldInnerHtml(html, "subject"));
  const previewText = decodeHtml(readFieldInnerHtml(html, "previewText")) || undefined;
  const segments: string[] = [];
  for (let index = 0; ; index += 1) {
    const raw = readFieldInnerHtml(html, `segment-${index}`);
    if (!raw && index > 0 && readFieldInnerHtml(html, `segment-${index + 1}`) === "") {
      // Empty segment slot marks the end only when the next slot is also absent.
      // A translated segment can legitimately be empty, so probe ahead.
      break;
    }
    if (index === 0 && !raw) {
      break;
    }
    if (!raw) {
      break;
    }
    segments.push(decodeHtml(raw));
    // Stop when the next indexed block is missing.
    if (readFieldInnerHtml(html, `segment-${index + 1}`) === "" && segments.length > 0) {
      // Peek: if the raw html does not contain the next field name, stop.
      if (!html.includes(`segment-${index + 1}`)) {
        break;
      }
    }
  }
  return { subject, previewText, segments };
}

/**
 * Splice translated segments back into LMX in extraction order,
 * restoring `{data.*}` / `{contact.*}` / `{event.*}` tokens captured at import.
 */
export function applyLoopsSegmentTranslations(input: {
  lmx: string;
  translatedSegments: string[];
  tokensBySegment?: string[][];
}): string {
  let segmentIndex = 0;
  return input.lmx.replace(/>([^<>]+)</g, (full, inner: string) => {
    if (!/[A-Za-zÀ-ÿ0-9]/.test(inner) || inner.trim().length === 0) {
      return full;
    }
    const translated = input.translatedSegments[segmentIndex];
    segmentIndex += 1;
    if (translated === undefined) {
      return full;
    }
    const tokens = input.tokensBySegment?.[segmentIndex - 1] ?? [];
    const restored = restoreLoopsVariables(translated, tokens);
    // Preserve the surrounding whitespace of the source run.
    const leading = inner.match(/^\s*/)?.[0] ?? "";
    const trailing = inner.match(/\s*$/)?.[0] ?? "";
    const core = restored.trim();
    if (!core) {
      return full;
    }
    return `>${leading}${core}${trailing}<`;
  });
}

export function slugifyLoopsPathSegment(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback.trim() || "item";
}

function loopsSourcePathToken(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 8);
}

export function buildLoopsEmailSourcePath(input: {
  kind: LoopsResourceKind;
  id: string;
  name?: string | null;
  parentSlug?: string | null;
}): string {
  const slug = slugifyLoopsPathSegment(input.name ?? "", input.id);
  const token = loopsSourcePathToken(`${input.kind}:${input.id}`);
  if (input.kind === "transactional") {
    return normalizeSourcePath(`loops/transactional/${slug}-${token}.html`);
  }
  if (input.kind === "campaign") {
    return normalizeSourcePath(`loops/campaigns/${slug}-${token}.html`);
  }
  const parent = slugifyLoopsPathSegment(input.parentSlug ?? "", "workflow");
  return normalizeSourcePath(`loops/workflows/${parent}/${slug}-${token}.html`);
}

/** Locale copies are named `{source} [{locale}]`, matching the Loops dashboard convention. */
export function loopsEmailCopyName(sourceName: string, locale: string): string {
  const base = sourceName.trim() || "Email";
  return `${base} [${locale.trim() || "locale"}]`;
}

export function isLoopsLocaleCopyName(name: string): boolean {
  return /\[[^\]]+\]\s*$/.test(name.trim());
}

/**
 * Loops only accepts an ISO 639-1 `languageCode` (`en`, `fr`), so project
 * locales map via the primary subtag (`fr-FR` writes `fr`). The full tag
 * still names the locale copy (`{source} [{locale}]`).
 */
export function toLoopsLanguageCode(locale: string): string {
  const primary = locale.trim().split(/[-_]/)[0] ?? "";
  return primary.toLowerCase().slice(0, 2) || "en";
}

/**
 * Compare the `languageCode` stored on a Loops email message against the
 * requested code. Loops returns the label verbatim when it sticks; a missing
 * or different value (e.g. `en` after pushing `zh`) means the copy landed
 * without its language label and the dashboard picker falls back to EN.
 */
export function isLoopsLanguageCodeMismatch(
  stored: string | null | undefined,
  requested: string,
): boolean {
  const normalizedStored = stored?.trim().toLowerCase();
  const normalizedRequested = requested.trim().toLowerCase();
  if (!normalizedRequested) {
    return false;
  }
  if (!normalizedStored) {
    return true;
  }
  return normalizedStored !== normalizedRequested;
}
