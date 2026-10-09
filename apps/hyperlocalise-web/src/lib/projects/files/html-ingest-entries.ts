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
const HTML_RAW_TEXT_ELEMENTS = new Set(["script", "style", "pre", "textarea", "title"]);
const HTML_BLOCK_ELEMENTS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "caption",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
  "label",
  "button",
  "legend",
  "option",
]);
const HTML_STRUCTURAL_ELEMENTS = new Set(["html", "body", "template", "colgroup"]);
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

export function extractHtmlIngestEntries(
  html: string,
  options?: { foldInline?: boolean },
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of extractHtmlIngestEntriesInOrder(html, options)) {
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

export function legacyHtmlHashToPathKeys(html: string): Map<string, string[]> {
  const mapping = new Map<string, string[]>();
  const occurrences = new Map<string, number>();
  for (const unit of extractFoldedHtmlUnits(html)) {
    const legacy = legacyHtmlSegmentKey(unit.text, occurrences);
    mapping.set(legacy, unit.pathKeys);
  }
  return mapping;
}

export function htmlCompletedPathKeysFromLock(
  html: string,
  completedLegacyKeys: readonly string[],
): string[] {
  const hashToPaths = legacyHtmlHashToPathKeys(html);
  const out = new Set<string>();
  for (const key of completedLegacyKeys) {
    const match = HASHED_HTML_KEY.exec(key);
    const base = match ? `html.${match[1]}${match[2] ? `.${match[2]}` : ""}` : key;
    for (const pathKey of hashToPaths.get(base) ?? []) {
      out.add(pathKey);
    }
  }
  return [...out];
}

export function htmlCliPrefillsFromPathEntries(
  html: string,
  pathEntries: Record<string, string>,
): Record<string, string> {
  if (Object.keys(pathEntries).length === 0) {
    return {};
  }
  const rewritten = rewriteHtmlIngestTexts(html, pathEntries);
  const sourceUnits = extractFoldedHtmlUnits(html);
  const targetUnits = extractFoldedHtmlUnits(rewritten);
  if (sourceUnits.length !== targetUnits.length) {
    return {};
  }
  const occurrences = new Map<string, number>();
  const out: Record<string, string> = {};
  for (let index = 0; index < sourceUnits.length; index += 1) {
    const source = sourceUnits[index];
    const target = targetUnits[index];
    if (!source || !target) {
      continue;
    }
    const legacy = legacyHtmlSegmentKey(source.text, occurrences);
    if (!source.pathKeys.every((key) => pathEntries[key]?.trim())) {
      continue;
    }
    out[legacy] = target.text;
  }
  return out;
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

type FoldedHtmlUnit = {
  text: string;
  blockKey: string;
  pathKeys: string[];
};

export function extractHtmlIngestEntriesInOrder(
  html: string,
  options?: { foldInline?: boolean },
): HtmlIngestEntry[] {
  const entries: HtmlIngestEntry[] = [];
  walkHtmlDocument(html, {
    foldInline: options?.foldInline === true,
    onText(key, text) {
      entries.push({ key, text });
    },
  });
  return entries;
}

function extractFoldedHtmlUnits(html: string): FoldedHtmlUnit[] {
  const splitEntries = extractHtmlIngestEntriesInOrder(html);
  const units: FoldedHtmlUnit[] = [];
  let splitIndex = 0;

  const takeSplitKeys = (pieceCount: number, expectedTexts: readonly string[]): string[] => {
    const slice = splitEntries.slice(splitIndex, splitIndex + pieceCount);
    splitIndex += slice.length;
    if (
      slice.length !== pieceCount ||
      expectedTexts.some((text, index) => slice[index]?.text !== text)
    ) {
      return [];
    }
    return slice.map((entry) => entry.key);
  };

  walkHtmlDocument(html, {
    foldInline: true,
    onText(key, text, raw, stack) {
      const pieces = splitEntriesForFoldedRaw(stack, raw);
      units.push({
        text,
        blockKey: key,
        pathKeys: takeSplitKeys(
          pieces.length,
          pieces.map((piece) => piece.text),
        ),
      });
    },
    onVoidAttr(key, text) {
      units.push({
        text,
        blockKey: key,
        pathKeys: takeSplitKeys(1, [text]),
      });
    },
  });
  return units;
}

function rewriteHtmlIngestTexts(html: string, translations: Record<string, string>): string {
  let out = "";
  walkHtmlDocument(html, {
    onLiteral(raw) {
      out += raw;
    },
    onText(key, _text, raw) {
      out += translations[key] ?? raw;
    },
    onVoidAttr(key, _text, raw, attrName) {
      const next = translations[key];
      out += next === undefined ? raw : replaceVoidAttrValue(raw, attrName, next);
    },
  });
  return out;
}

function legacyHtmlKeyToPathKey(html: string): Map<string, string> {
  const mapping = new Map<string, string>();
  const occurrences = new Map<string, number>();
  for (const unit of extractFoldedHtmlUnits(html)) {
    mapping.set(legacyHtmlSegmentKey(unit.text, occurrences), unit.blockKey);
  }
  return mapping;
}

function splitEntriesForFoldedRaw(stack: readonly string[], raw: string): HtmlIngestEntry[] {
  const open = stack.map((tag) => `<${tag}>`).join("");
  const close = [...stack]
    .reverse()
    .map((tag) => `</${tag}>`)
    .join("");
  return extractHtmlIngestEntriesInOrder(`${open}${raw}${close}`);
}

function walkHtmlDocument(
  html: string,
  handlers: {
    foldInline?: boolean;
    onLiteral?: (raw: string) => void;
    onText?: (key: string, text: string, raw: string, stack: readonly string[]) => void;
    onVoidAttr?: (key: string, text: string, raw: string, attrName: string) => void;
  },
) {
  const foldInline = handlers.foldInline === true;
  const occurrences = new Map<string, number>();
  const stack: string[] = [];
  let buffer = "";
  let skipDepth = 0;

  const emitLiteral = (raw: string) => {
    handlers.onLiteral?.(raw);
  };

  const flushBuffer = () => {
    const raw = buffer;
    buffer = "";
    if (raw === "") {
      return;
    }
    if (isAllHTMLWhitespace(raw)) {
      emitLiteral(raw);
      return;
    }
    const { placeholdered, plainText } = protectHTMLInlineSyntax(raw);
    if (!isTranslatableChunk(plainText)) {
      emitLiteral(raw);
      return;
    }
    const key = htmlSlotKey(htmlPathFromStack(stack), occurrences);
    handlers.onText?.(key, placeholdered, raw, stack);
  };

  const handleVoidTranslatable = (raw: string, tag: string, attrName: string) => {
    const split = splitVoidAttrTag(raw, attrName);
    const decoded = split ? unescapeHtml(split.rawVal) : "";
    if (split && isTranslatableChunk(decoded)) {
      flushBuffer();
      const key = htmlSlotKey(htmlPathFromStack(stack, [tag, attrName]), occurrences);
      handlers.onVoidAttr?.(key, decoded, raw, attrName);
      if (!handlers.onVoidAttr) {
        handlers.onText?.(key, decoded, decoded, stack);
      }
      return;
    }
    buffer += raw;
  };

  const isFoldBoundary = (tag: string) =>
    HTML_BLOCK_ELEMENTS.has(tag) || HTML_STRUCTURAL_ELEMENTS.has(tag);

  for (const token of tokenizeHtml(html)) {
    if (skipDepth > 0) {
      emitLiteral(token.raw);
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
        emitLiteral(token.raw);
        break;
      case "start":
        if (HTML_SKIP_ELEMENTS.has(token.name)) {
          flushBuffer();
          skipDepth += 1;
          emitLiteral(token.raw);
        } else if (foldInline && isFoldBoundary(token.name)) {
          flushBuffer();
          emitLiteral(token.raw);
          stack.push(token.name);
        } else if (HTML_VOID_TRANSLATABLE_ATTRS[token.name]) {
          handleVoidTranslatable(token.raw, token.name, HTML_VOID_TRANSLATABLE_ATTRS[token.name]);
        } else if (foldInline) {
          buffer += token.raw;
        } else {
          flushBuffer();
          emitLiteral(token.raw);
          if (htmlPushesPath(token.name)) {
            stack.push(token.name);
          }
        }
        break;
      case "end":
        if (foldInline && !isFoldBoundary(token.name)) {
          buffer += token.raw;
          break;
        }
        flushBuffer();
        if (stack.at(-1) === token.name) {
          stack.pop();
        }
        emitLiteral(token.raw);
        break;
      case "selfClosing":
        if (foldInline && isFoldBoundary(token.name)) {
          flushBuffer();
          emitLiteral(token.raw);
        } else if (HTML_VOID_TRANSLATABLE_ATTRS[token.name]) {
          handleVoidTranslatable(token.raw, token.name, HTML_VOID_TRANSLATABLE_ATTRS[token.name]);
        } else if (foldInline) {
          buffer += token.raw;
        } else {
          flushBuffer();
          emitLiteral(token.raw);
        }
        break;
    }
  }
  flushBuffer();
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

const HTML_NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  iexcl: "¡",
  cent: "¢",
  pound: "£",
  curren: "¤",
  yen: "¥",
  brvbar: "¦",
  sect: "§",
  uml: "¨",
  copy: "©",
  ordf: "ª",
  laquo: "«",
  not: "¬",
  shy: "\u00ad",
  reg: "®",
  macr: "¯",
  deg: "°",
  plusmn: "±",
  sup2: "²",
  sup3: "³",
  acute: "´",
  micro: "µ",
  para: "¶",
  middot: "·",
  cedil: "¸",
  sup1: "¹",
  ordm: "º",
  raquo: "»",
  frac14: "¼",
  frac12: "½",
  frac34: "¾",
  iquest: "¿",
  Agrave: "À",
  Aacute: "Á",
  Acirc: "Â",
  Atilde: "Ã",
  Auml: "Ä",
  Aring: "Å",
  AElig: "Æ",
  Ccedil: "Ç",
  Egrave: "È",
  Eacute: "É",
  Ecirc: "Ê",
  Euml: "Ë",
  Igrave: "Ì",
  Iacute: "Í",
  Icirc: "Î",
  Iuml: "Ï",
  ETH: "Ð",
  Ntilde: "Ñ",
  Ograve: "Ò",
  Oacute: "Ó",
  Ocirc: "Ô",
  Otilde: "Õ",
  Ouml: "Ö",
  times: "×",
  Oslash: "Ø",
  Ugrave: "Ù",
  Uacute: "Ú",
  Ucirc: "Û",
  Uuml: "Ü",
  Yacute: "Ý",
  THORN: "Þ",
  szlig: "ß",
  agrave: "à",
  aacute: "á",
  acirc: "â",
  atilde: "ã",
  auml: "ä",
  aring: "å",
  aelig: "æ",
  ccedil: "ç",
  egrave: "è",
  eacute: "é",
  ecirc: "ê",
  euml: "ë",
  igrave: "ì",
  iacute: "í",
  icirc: "î",
  iuml: "ï",
  eth: "ð",
  ntilde: "ñ",
  ograve: "ò",
  oacute: "ó",
  ocirc: "ô",
  otilde: "õ",
  ouml: "ö",
  divide: "÷",
  oslash: "ø",
  ugrave: "ù",
  uacute: "ú",
  ucirc: "û",
  uuml: "ü",
  yacute: "ý",
  thorn: "þ",
  yuml: "ÿ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  euro: "€",
  trade: "™",
};

function unescapeHtml(value: string): string {
  return value.replace(
    /&(#x[0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]+);/g,
    (matched, entity: string) => {
      if (entity.startsWith("#")) {
        const code =
          entity[1] === "x" || entity[1] === "X"
            ? Number.parseInt(entity.slice(2), 16)
            : Number.parseInt(entity.slice(1), 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {
          return matched;
        }
        return String.fromCodePoint(code);
      }
      return HTML_NAMED_ENTITIES[entity] ?? matched;
    },
  );
}

function replaceVoidAttrValue(raw: string, attrName: string, value: string): string {
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  if (VOID_ATTR_DOUBLE_QUOTE.test(raw)) {
    return raw.replace(VOID_ATTR_DOUBLE_QUOTE, ` ${attrName}="${escaped}"`);
  }
  if (VOID_ATTR_SINGLE_QUOTE.test(raw)) {
    return raw.replace(
      VOID_ATTR_SINGLE_QUOTE,
      ` ${attrName}='${escaped.replaceAll("'", "&#39;")}'`,
    );
  }
  return raw;
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
    const raw =
      match && match.index === lt
        ? match[0]
        : html.slice(
            lt,
            (() => {
              const end = html.indexOf(">", lt + 1);
              return end < 0 ? html.length : end + 1;
            })(),
          );
    index = pushHtmlTagToken(tokens, html, raw, lt);
  }
  return tokens;
}

function pushHtmlTagToken(tokens: HtmlToken[], html: string, raw: string, lt: number): number {
  const token = tagTokenFromRaw(raw);
  if (token) {
    tokens.push(token);
  } else {
    tokens.push({ kind: "text", raw });
  }
  let index = lt + raw.length;
  if (token?.kind === "start" && HTML_RAW_TEXT_ELEMENTS.has(token.name)) {
    const close = findRawTextClose(html, index, token.name);
    if (close.start > index) {
      tokens.push({ kind: "text", raw: html.slice(index, close.start) });
    }
    if (close.end > close.start) {
      tokens.push({ kind: "end", name: token.name, raw: html.slice(close.start, close.end) });
    }
    index = close.end;
  }
  return index;
}

function findRawTextClose(html: string, from: number, tag: string): { start: number; end: number } {
  const match = new RegExp(`</${tag}\\s*>`, "i").exec(html.slice(from));
  if (!match) {
    return { start: html.length, end: html.length };
  }
  return { start: from + match.index, end: from + match.index + match[0].length };
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
