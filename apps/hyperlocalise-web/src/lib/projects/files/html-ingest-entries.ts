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

import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";

import type { HlEntriesPayload } from "./hl-entries";

const HEX_UPPER = "0123456789ABCDEF";
const HASHED_HTML_KEY = /^html\.([0-9a-f]{16})(?:\.(\d+))?(#srx\.\d+)?$/;
const HTML_TAG_PATTERN = /<(?:[^>"']*(?:"[^"]*"|'[^']*'))*[^>]*>/g;
const VOID_ATTR_DOUBLE_QUOTE = /[\s]alt\s*=\s*"([^"]*)"/i;
const VOID_ATTR_SINGLE_QUOTE = /[\s]alt\s*=\s*'([^']*)'/i;

const HTML_SKIP_ELEMENTS = new Set(["head", "script", "style", "pre"]);
const HTML_VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const HTML_VOID_TRANSLATABLE_ATTRS: Record<string, string> = { img: "alt" };

function htmlPushesPath(tag: string): boolean {
  return !HTML_SKIP_ELEMENTS.has(tag) && !HTML_VOID_ELEMENTS.has(tag);
}

export type HtmlIngestEntry = {
  key: string;
  text: string;
};

export function utf8FromStoredFileContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (content instanceof Uint8Array) {
    return new TextDecoder().decode(content);
  }
  if (ArrayBuffer.isView(content)) {
    const view = content as ArrayBufferView;
    return new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  }
  if (content instanceof ArrayBuffer) {
    return new TextDecoder().decode(content);
  }
  if (
    content &&
    typeof content === "object" &&
    "data" in content &&
    Array.isArray((content as { data: unknown }).data)
  ) {
    return new TextDecoder().decode(Uint8Array.from((content as { data: number[] }).data));
  }
  return "";
}

export function isHtmlTranslationSourcePath(sourcePath: string): boolean {
  return inferSupportedTranslationFileFormat(sourcePath) === "html";
}

export function isHashedHtmlEntryKey(key: string): boolean {
  return HASHED_HTML_KEY.test(key);
}

export function extractHtmlIngestEntries(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of extractHtmlIngestEntriesInOrder(html)) {
    out[entry.key] = entry.text;
  }
  return out;
}

export function applyHtmlIngestEntryKeys(
  sourcePath: string,
  sourceText: string,
  payload: HlEntriesPayload,
): HlEntriesPayload {
  if (!isHtmlTranslationSourcePath(sourcePath) || sourceText.length === 0) {
    return payload;
  }

  const extracted = extractHtmlIngestEntries(sourceText);
  if (Object.keys(extracted).length === 0) {
    return payload;
  }

  if (Object.keys(payload).some((key) => key.includes("#srx."))) {
    return remapHashedHtmlPayload(sourceText, payload);
  }

  return extracted;
}

export function rewriteHashedHtmlSegmentKey(html: string, key: string, sourceText: string): string {
  const mapping = legacyHtmlKeyToPathKey(html);
  return mapping.get(key) ?? mapping.get(legacyHtmlSegmentKey(sourceText, new Map())) ?? key;
}

export function rewriteHashedHtmlSegmentKeys(
  html: string,
  segments: Array<{ key: string; sourceText: string }>,
): string[] {
  const mapping = legacyHtmlKeyToPathKey(html);
  const used = new Set<string>();
  return segments.map((segment) => {
    const mapped = mapping.get(segment.key);
    if (mapped && !used.has(mapped)) {
      used.add(mapped);
      return mapped;
    }
    const legacy = legacyHtmlSegmentKey(segment.sourceText, new Map());
    const byText = mapping.get(legacy);
    if (byText && !used.has(byText)) {
      used.add(byText);
      return byText;
    }
    return segment.key;
  });
}

function remapHashedHtmlPayload(html: string, payload: HlEntriesPayload): HlEntriesPayload {
  const legacyToPath = legacyHtmlKeyToPathKey(html);

  const out: HlEntriesPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    const match = HASHED_HTML_KEY.exec(key);
    if (!match) {
      out[key] = value;
      continue;
    }
    const base = `html.${match[1]}${match[2] ? `.${match[2]}` : ""}`;
    const pathKey = legacyToPath.get(base);
    if (!pathKey) {
      out[key] = value;
      continue;
    }
    out[`${pathKey}${match[3] ?? ""}`] = value;
  }
  return out;
}

export function extractHtmlIngestEntriesInOrder(html: string): HtmlIngestEntry[] {
  const entries: HtmlIngestEntry[] = [];
  const occurrences = new Map<string, number>();
  const stack: string[] = [];
  let buffer = "";
  let skipDepth = 0;

  const appendEntry = (text: string, extra: string[] = []) => {
    const key = htmlSlotKey(htmlPathFromStack(stack, extra), occurrences);
    entries.push({ key, text });
  };

  const flushBuffer = () => {
    const raw = buffer;
    buffer = "";
    if (raw === "" || isAllHTMLWhitespace(raw)) {
      return;
    }
    const { placeholdered, plainText } = protectHTMLInlineSyntax(raw);
    if (!isTranslatableChunk(plainText)) {
      return;
    }
    appendEntry(placeholdered);
  };

  const handleVoidTranslatable = (raw: string, tag: string, attrName: string) => {
    const split = splitVoidAttrTag(raw, attrName);
    if (split && isTranslatableChunk(unescapeHtml(split.rawVal))) {
      flushBuffer();
      appendEntry(unescapeHtml(split.rawVal), [tag, attrName]);
      return;
    }
    buffer += raw;
  };

  for (const token of tokenizeHtml(html)) {
    if (skipDepth > 0) {
      if (token.kind === "end" && HTML_SKIP_ELEMENTS.has(token.name)) {
        skipDepth -= 1;
      } else if (token.kind === "start" && HTML_SKIP_ELEMENTS.has(token.name)) {
        skipDepth += 1;
      }
      continue;
    }

    switch (token.kind) {
      case "text":
        buffer += token.raw;
        break;
      case "comment":
      case "doctype":
        flushBuffer();
        break;
      case "start":
        if (HTML_SKIP_ELEMENTS.has(token.name)) {
          flushBuffer();
          skipDepth += 1;
        } else if (HTML_VOID_TRANSLATABLE_ATTRS[token.name]) {
          handleVoidTranslatable(token.raw, token.name, HTML_VOID_TRANSLATABLE_ATTRS[token.name]);
        } else {
          flushBuffer();
          if (htmlPushesPath(token.name)) {
            stack.push(token.name);
          }
        }
        break;
      case "end":
        flushBuffer();
        if (stack.at(-1) === token.name) {
          stack.pop();
        }
        break;
      case "selfClosing":
        if (HTML_VOID_TRANSLATABLE_ATTRS[token.name]) {
          handleVoidTranslatable(token.raw, token.name, HTML_VOID_TRANSLATABLE_ATTRS[token.name]);
        } else {
          flushBuffer();
        }
        break;
    }
  }
  flushBuffer();
  return entries;
}

function legacyHtmlKeyToPathKey(html: string): Map<string, string> {
  const mapping = new Map<string, string>();
  const occurrences = new Map<string, number>();
  for (const entry of extractHtmlIngestEntriesInOrder(html)) {
    mapping.set(legacyHtmlSegmentKey(entry.text, occurrences), entry.key);
  }
  return mapping;
}

export function legacyHtmlSegmentKey(segment: string, occurrences: Map<string, number>): string {
  const hash = createHash("sha256").update(segment).digest("hex").slice(0, 16);
  const count = occurrences.get(hash) ?? 0;
  occurrences.set(hash, count + 1);
  if (count === 0) {
    return `html.${hash}`;
  }
  return `html.${hash}.${count + 1}`;
}

function htmlPathFromStack(stack: string[], extra: string[] = []): string {
  const tags = stack[0] === "html" ? stack.slice(1) : stack;
  const path = extra.length > 0 ? [...tags, ...extra] : tags;
  return path.length === 0 ? "text" : path.join(".");
}

function htmlSlotKey(path: string, occurrences: Map<string, number>): string {
  const slot = path || "text";
  const count = occurrences.get(slot) ?? 0;
  occurrences.set(slot, count + 1);
  if (count === 0) {
    return `html.${slot}`;
  }
  return `html.${slot}.${count + 1}`;
}

function isAllHTMLWhitespace(value: string): boolean {
  return value.trim().length === 0;
}

function isTranslatableChunk(chunk: string): boolean {
  for (const char of chunk) {
    if (/[0-9A-Za-z]/.test(char) || /\p{L}|\p{N}/u.test(char)) {
      return true;
    }
  }
  return false;
}

function protectHTMLInlineSyntax(segment: string): { placeholdered: string; plainText: string } {
  let rendered = "";
  let plain = "";
  let placeholderCount = 0;
  let pos = 0;
  HTML_TAG_PATTERN.lastIndex = 0;
  for (const match of segment.matchAll(HTML_TAG_PATTERN)) {
    const index = match.index ?? 0;
    const text = segment.slice(pos, index);
    rendered += text;
    plain += text;
    const literal = match[0];
    const digest = createHash("sha256").update(`${placeholderCount}:${literal}`).digest();
    let hex = "";
    for (let i = 0; i < 6; i += 1) {
      const byte = digest[i] ?? 0;
      hex += HEX_UPPER[(byte >> 4) & 0xf];
      hex += HEX_UPPER[byte & 0xf];
    }
    rendered += `\x1eHLHTPH_${hex}_${placeholderCount}\x1f`;
    placeholderCount += 1;
    pos = index + literal.length;
  }
  const tail = segment.slice(pos);
  rendered += tail;
  plain += tail;
  return { placeholdered: rendered, plainText: plain };
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function splitVoidAttrTag(raw: string, attrName: string): { rawVal: string } | null {
  if (attrName !== "alt") {
    return null;
  }
  const double = VOID_ATTR_DOUBLE_QUOTE.exec(raw);
  if (double?.[1] !== undefined) {
    return { rawVal: double[1] };
  }
  const single = VOID_ATTR_SINGLE_QUOTE.exec(raw);
  if (single?.[1] !== undefined) {
    return { rawVal: single[1] };
  }
  return null;
}

type HtmlToken =
  | { kind: "text"; raw: string }
  | { kind: "comment" | "doctype"; raw: string }
  | { kind: "start" | "end" | "selfClosing"; name: string; raw: string };

function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  let index = 0;
  while (index < html.length) {
    const lt = html.indexOf("<", index);
    if (lt < 0) {
      tokens.push({ kind: "text", raw: html.slice(index) });
      break;
    }
    if (lt > index) {
      tokens.push({ kind: "text", raw: html.slice(index, lt) });
    }
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      const close = end < 0 ? html.length : end + 3;
      tokens.push({ kind: "comment", raw: html.slice(lt, close) });
      index = close;
      continue;
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt + 2);
      const close = end < 0 ? html.length : end + 1;
      tokens.push({ kind: "doctype", raw: html.slice(lt, close) });
      index = close;
      continue;
    }

    HTML_TAG_PATTERN.lastIndex = lt;
    const match = HTML_TAG_PATTERN.exec(html);
    if (!match || match.index !== lt) {
      const end = html.indexOf(">", lt + 1);
      const close = end < 0 ? html.length : end + 1;
      const raw = html.slice(lt, close);
      const token = tagTokenFromRaw(raw);
      if (token) {
        tokens.push(token);
      } else {
        tokens.push({ kind: "text", raw });
      }
      index = close;
      continue;
    }

    const raw = match[0];
    const token = tagTokenFromRaw(raw);
    if (token) {
      tokens.push(token);
    } else {
      tokens.push({ kind: "text", raw });
    }
    index = lt + raw.length;
  }
  return tokens;
}

function tagTokenFromRaw(raw: string): HtmlToken | null {
  const endMatch = /^<\/([A-Za-z][\w:-]*)/.exec(raw);
  if (endMatch?.[1]) {
    return { kind: "end", name: endMatch[1].toLowerCase(), raw };
  }
  const startMatch = /^<([A-Za-z][\w:-]*)/.exec(raw);
  if (!startMatch?.[1]) {
    return null;
  }
  const name = startMatch[1].toLowerCase();
  const selfClosing = /\/\s*>$/.test(raw);
  return { kind: selfClosing ? "selfClosing" : "start", name, raw };
}
