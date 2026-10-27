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

import { extractInternalMarkupSpans } from "./content-editor-internal-markup";

type MarkdownDelimiter = {
  start: number;
  end: number;
  literal: string;
};

const PLACEHOLDER_URL_PREFIX = "https://hl.cat.placeholder/";

const INTERNAL_MARKUP_PATTERN = new RegExp(
  `${String.fromCharCode(0x1e)}HL(?:MD|HT|LQ|UE)PH_[0-9A-Fa-f]+_\\d+${String.fromCharCode(0x1f)}`,
  "g",
);

export type MarkdownMarkupDisplayOptions = {
  /** Raw source markdown (e.g. Intercom article body) aligned to the protected source segment. */
  sourceMarkdown?: string;
};

function markdownMarkupSpans(message: string) {
  return extractInternalMarkupSpans(message).filter((span) => span.family === "MD");
}

function startsMarkdownLinkLabel(segment: string, start: number) {
  if (start < 0 || start >= segment.length || segment[start] !== "[") {
    return false;
  }
  let backslashes = 0;
  for (let idx = start - 1; idx >= 0 && segment[idx] === "\\"; idx -= 1) {
    backslashes += 1;
  }
  if (backslashes % 2 !== 0) {
    return false;
  }

  let depth = 1;
  for (let idx = start + 1; idx < segment.length; idx += 1) {
    const ch = segment[idx];
    if (ch === "\\") {
      idx += 1;
      continue;
    }
    if (ch === "[") {
      depth += 1;
      continue;
    }
    if (ch !== "]") {
      continue;
    }
    depth -= 1;
    if (depth !== 0) {
      continue;
    }
    return idx + 1 < segment.length && (segment[idx + 1] === "(" || segment[idx + 1] === "[");
  }
  return false;
}

function findMarkdownLinkDestinationEnd(line: string, start: number) {
  let depth = 1;
  let quote = "";
  for (let idx = start; idx < line.length; idx += 1) {
    const ch = line[idx] ?? "";
    if (ch === "\\") {
      idx += 1;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        return idx + 1;
      }
    }
  }
  return line.length;
}

function intercomHeadingIdEnd(segment: string, idx: number) {
  if (idx + 3 >= segment.length || !segment.startsWith("{#", idx)) {
    return -1;
  }
  const start = segment[idx + 2] ?? "";
  if (!/[A-Za-z]/.test(start)) {
    return -1;
  }
  let end = idx + 3;
  while (end < segment.length && /[A-Za-z0-9_:-]/.test(segment[end] ?? "")) {
    end += 1;
  }
  return segment[end] === "}" ? end + 1 : -1;
}

/** Collects the same markdown delimiters the Go parser protects as HLMDPH tokens. */
export function collectStandardMarkdownDelimiters(segment: string): MarkdownDelimiter[] {
  const delimiters: MarkdownDelimiter[] = [];
  let idx = 0;
  while (idx < segment.length) {
    if (segment[idx] === "!" && startsMarkdownLinkLabel(segment, idx + 1)) {
      delimiters.push({ start: idx, end: idx + 2, literal: segment.slice(idx, idx + 2) });
      idx += 2;
      continue;
    }
    if (segment[idx] === "[" && startsMarkdownLinkLabel(segment, idx)) {
      delimiters.push({ start: idx, end: idx + 1, literal: "[" });
      idx += 1;
      continue;
    }
    if (segment.startsWith("](", idx)) {
      const end = findMarkdownLinkDestinationEnd(segment, idx + 2);
      delimiters.push({ start: idx, end, literal: segment.slice(idx, end) });
      idx = end;
      continue;
    }
    if (segment.startsWith("][", idx)) {
      const closeIdx = segment.indexOf("]", idx + 2);
      if (closeIdx < 0) {
        idx += 1;
        continue;
      }
      const end = closeIdx + 1;
      delimiters.push({ start: idx, end, literal: segment.slice(idx, end) });
      idx = end;
      continue;
    }
    const headingEnd = intercomHeadingIdEnd(segment, idx);
    if (headingEnd > idx) {
      delimiters.push({
        start: idx,
        end: headingEnd,
        literal: segment.slice(idx, headingEnd),
      });
      idx = headingEnd;
      continue;
    }
    idx += 1;
  }
  return delimiters;
}

function isPlaceholderHref(href: string): boolean {
  return href.startsWith(PLACEHOLDER_URL_PREFIX);
}

function parseMarkdownLinkHrefsInOrder(markdown: string): string[] {
  const delimiters = collectStandardMarkdownDelimiters(markdown);
  const hrefs: string[] = [];
  for (let index = 0; index < delimiters.length; index += 1) {
    const opener = delimiters[index]!;
    const closer = delimiters[index + 1];
    const isOpener = opener.literal === "[" || opener.literal === "![";
    const isCloser =
      closer != null && (closer.literal.startsWith("](") || closer.literal.startsWith("]["));
    if (isOpener && isCloser) {
      if (closer.literal.startsWith("](") && closer.literal.endsWith(")")) {
        hrefs.push(closer.literal.slice(2, -1));
      } else if (closer.literal.startsWith("][") && closer.literal.endsWith("]")) {
        hrefs.push(closer.literal.slice(2, -1));
      }
      index += 1;
    }
  }
  return hrefs;
}

function applyDelimitersToSentinels(
  message: string,
  tokens: ReturnType<typeof markdownMarkupSpans>,
  delimiters: MarkdownDelimiter[],
): string {
  let expanded = message;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index]!;
    const delimiter = delimiters[index]!;
    expanded = `${expanded.slice(0, token.start)}${delimiter.literal}${expanded.slice(token.end)}`;
  }
  return expanded;
}

function trailingIntercomHeadingId(segment: string, start: number): string | null {
  const trailing = segment.slice(start).trimStart();
  const match = trailing.match(/^(\{#[A-Za-z][\w:-]*\})/);
  return match?.[1] ?? null;
}

/** Rebuilds raw `[label](url)` markdown from a sentinel-protected segment. */
export function buildSyntheticRawFromSentinels(
  segment: string,
  urlForLinkIndex: (linkIndex: number) => string,
): string {
  const tokens = markdownMarkupSpans(segment);
  if (tokens.length === 0) {
    return segment;
  }

  let linkIndex = 0;
  let cursor = 0;
  let next = "";

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    next += segment.slice(cursor, token.start);

    const headingAfter = trailingIntercomHeadingId(segment, token.end);
    if (headingAfter && index === tokens.length - 1) {
      next += headingAfter;
      cursor = segment.length;
      break;
    }

    const closer = tokens[index + 1];
    if (closer) {
      const label = segment.slice(token.end, closer.start);
      const href = urlForLinkIndex(linkIndex);
      linkIndex += 1;
      next += `[${label}](${href})`;
      cursor = closer.end;
      index += 1;
      continue;
    }

    cursor = token.end;
  }

  next += segment.slice(cursor);
  return next;
}

function placeholderUrl(linkIndex: number): string {
  return `${PLACEHOLDER_URL_PREFIX}${linkIndex}`;
}

type MarkupToken = { kind: "text"; value: string } | { kind: "markup"; value: string };

function tokenizeInternalMarkup(value: string): MarkupToken[] {
  const tokens: MarkupToken[] = [];
  let cursor = 0;
  for (const match of value.matchAll(INTERNAL_MARKUP_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      tokens.push({ kind: "text", value: value.slice(cursor, start) });
    }
    tokens.push({ kind: "markup", value: match[0] });
    cursor = start + match[0].length;
  }
  if (cursor < value.length || tokens.length === 0) {
    tokens.push({ kind: "text", value: value.slice(cursor) });
  }
  return tokens;
}

function matchLeadingMarkdownDelimiter(markdown: string, textStart: number): number {
  if (textStart >= 2 && markdown.slice(textStart - 2, textStart) === "![") {
    return textStart - 2;
  }
  if (textStart >= 1 && markdown[textStart - 1] === "[") {
    return textStart - 1;
  }
  return textStart;
}

function matchTrailingMarkdownDelimiter(markdown: string, pos: number): number {
  const slice = markdown.slice(pos);
  const destination = /^\]\([^)]*\)/.exec(slice) ?? /^\]\[[^\]]*\]/.exec(slice);
  if (destination) {
    return pos + destination[0].length;
  }
  const headingId = /^\s*\{#[^}]+\}/.exec(slice);
  if (headingId) {
    return pos + headingId[0].length;
  }
  return pos;
}

function findMarkupTokenSequenceInMarkdown(
  markdown: string,
  cursor: number,
  tokens: readonly MarkupToken[],
): { expansions: Map<string, string> } | null {
  const expansions = new Map<string, string>();
  let pos = cursor;
  let start = -1;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.kind === "text") {
      if (token.value.length === 0) {
        continue;
      }
      const found = markdown.indexOf(token.value, pos);
      if (found < 0) {
        return null;
      }
      if (start < 0) {
        start = found;
      }
      const previous = index > 0 ? tokens[index - 1] : undefined;
      if (previous?.kind === "markup") {
        expansions.set(previous.value, markdown.slice(pos, found));
      }
      pos = found + token.value.length;
      continue;
    }

    if (index === tokens.length - 1) {
      if (start < 0) {
        return null;
      }
      const trailingEnd = matchTrailingMarkdownDelimiter(markdown, pos);
      expansions.set(token.value, markdown.slice(pos, trailingEnd));
      pos = trailingEnd;
    }
  }

  if (start < 0) {
    return null;
  }

  const first = tokens.find((token) => token.kind === "markup" || token.value.length > 0);
  if (first?.kind === "markup") {
    const leadingStart = matchLeadingMarkdownDelimiter(markdown, start);
    expansions.set(first.value, markdown.slice(leadingStart, start));
    start = leadingStart;
  }

  return { expansions };
}

/** Reads markdown delimiter literals for a protected segment from raw source markdown (Intercom compose parity). */
export function collectMarkdownDelimitersFromSourceMarkdown(
  protectedSegment: string,
  sourceMarkdown: string,
): MarkdownDelimiter[] | null {
  const tokens = tokenizeInternalMarkup(protectedSegment);
  const hasMarkup = tokens.some((token) => token.kind === "markup");
  if (!hasMarkup) {
    return null;
  }

  const match = findMarkupTokenSequenceInMarkdown(sourceMarkdown, 0, tokens);
  if (!match) {
    return null;
  }

  const delimiters: MarkdownDelimiter[] = [];
  const orderedMarkup = tokens
    .filter((token) => token.kind === "markup")
    .map((token) => token.value);
  for (const markupToken of orderedMarkup) {
    const literal = match.expansions.get(markupToken);
    if (literal == null) {
      return null;
    }
    delimiters.push({ start: -1, end: -1, literal });
  }

  const mdTokenCount = markdownMarkupSpans(protectedSegment).length;
  return delimiters.length === mdTokenCount ? delimiters : null;
}

function expandMarkdownMarkupOneHop(message: string, companion?: string): string {
  const tokens = markdownMarkupSpans(message);
  if (tokens.length === 0) {
    return message;
  }
  if (!companion) {
    return message;
  }
  const delimiters = collectStandardMarkdownDelimiters(companion);
  if (delimiters.length !== tokens.length) {
    return message;
  }
  return applyDelimitersToSentinels(message, tokens, delimiters);
}

function hrefsFromDelimiterLiterals(delimiters: MarkdownDelimiter[]): string[] {
  const hrefs: string[] = [];
  for (let index = 0; index < delimiters.length; index += 1) {
    const opener = delimiters[index]!;
    const closer = delimiters[index + 1];
    const isOpener = opener.literal === "[" || opener.literal === "![";
    const isCloser =
      closer != null && (closer.literal.startsWith("](") || closer.literal.startsWith("]["));
    if (isOpener && isCloser) {
      if (closer.literal.startsWith("](") && closer.literal.endsWith(")")) {
        hrefs.push(closer.literal.slice(2, -1));
      } else if (closer.literal.startsWith("][") && closer.literal.endsWith("]")) {
        hrefs.push(closer.literal.slice(2, -1));
      }
      index += 1;
    }
  }
  return hrefs;
}

function discoverDualSentinelUrls(
  reference: string,
  message: string,
  sourceMarkdown?: string,
): string[] | null {
  const tokens = markdownMarkupSpans(message);
  const referenceTokens = markdownMarkupSpans(reference);
  if (tokens.length === 0 || tokens.length !== referenceTokens.length) {
    return null;
  }

  if (sourceMarkdown) {
    const fromSource = collectMarkdownDelimitersFromSourceMarkdown(reference, sourceMarkdown);
    if (fromSource && fromSource.length === tokens.length) {
      const hrefs = hrefsFromDelimiterLiterals(fromSource);
      if (hrefs.length > 0 && hrefs.every((href) => href.length > 0 && !isPlaceholderHref(href))) {
        return hrefs;
      }
    }
  }

  const germanSynthetic = buildSyntheticRawFromSentinels(message, placeholderUrl);
  const linkCount = parseMarkdownLinkHrefsInOrder(germanSynthetic).length;
  if (linkCount === 0) {
    return [];
  }

  if (recoverMarkdownMarkupTokens(reference, germanSynthetic) !== message) {
    return null;
  }

  const oneHopHrefs = parseMarkdownLinkHrefsInOrder(expandMarkdownMarkupOneHop(reference, message));
  if (
    oneHopHrefs.length === linkCount &&
    oneHopHrefs.every((href) => href.length > 0 && !isPlaceholderHref(href))
  ) {
    return oneHopHrefs;
  }

  const englishSyntheticWithPlaceholders = buildSyntheticRawFromSentinels(
    reference,
    placeholderUrl,
  );
  const germanExpandedViaEnglish = expandMarkdownMarkupOneHop(
    message,
    englishSyntheticWithPlaceholders,
  );
  let urls = parseMarkdownLinkHrefsInOrder(germanExpandedViaEnglish);
  if (urls.length !== linkCount) {
    return null;
  }

  if (urls.every((href) => href.length > 0 && !isPlaceholderHref(href))) {
    return urls;
  }

  const englishExpandedViaGerman = expandMarkdownMarkupOneHop(reference, germanSynthetic);
  const urlsFromEnglishExpand = parseMarkdownLinkHrefsInOrder(englishExpandedViaGerman);
  if (
    urlsFromEnglishExpand.length === linkCount &&
    urlsFromEnglishExpand.every((href) => href.length > 0 && !isPlaceholderHref(href))
  ) {
    return urlsFromEnglishExpand;
  }

  for (let pass = 0; pass < linkCount + 2; pass += 1) {
    const englishSynthetic = buildSyntheticRawFromSentinels(
      reference,
      (k) => urls[k] ?? placeholderUrl(k),
    );
    const germanExpanded = expandMarkdownMarkupOneHop(message, englishSynthetic);
    const germanHrefs = parseMarkdownLinkHrefsInOrder(germanExpanded);
    if (
      germanHrefs.length === linkCount &&
      germanHrefs.every((href) => href.length > 0 && !isPlaceholderHref(href))
    ) {
      return germanHrefs;
    }

    const nextGermanSynthetic = buildSyntheticRawFromSentinels(
      message,
      (k) => urls[k] ?? placeholderUrl(k),
    );
    const nextEnglishExpanded = expandMarkdownMarkupOneHop(reference, nextGermanSynthetic);
    const nextUrls = parseMarkdownLinkHrefsInOrder(nextEnglishExpanded);
    if (nextUrls.length !== linkCount) {
      break;
    }
    if (nextUrls.every((href, index) => href === urls[index])) {
      break;
    }
    urls = nextUrls.map((href, index) =>
      !isPlaceholderHref(href) ? href : (urls[index] ?? placeholderUrl(index)),
    );
  }

  return urls.every((href) => href.length > 0) ? urls : null;
}

function resolveDualSentinelDelimiters(
  reference: string,
  message: string,
  sourceMarkdown?: string,
): MarkdownDelimiter[] | null {
  const tokens = markdownMarkupSpans(message);
  if (sourceMarkdown) {
    const fromSource = collectMarkdownDelimitersFromSourceMarkdown(reference, sourceMarkdown);
    if (fromSource && fromSource.length === tokens.length) {
      return fromSource;
    }
  }

  const urls = discoverDualSentinelUrls(reference, message, sourceMarkdown);
  if (!urls) {
    return null;
  }

  const syntheticReference = buildSyntheticRawFromSentinels(
    reference,
    (linkIndex) => urls[linkIndex] ?? placeholderUrl(linkIndex),
  );
  const delimiters = collectStandardMarkdownDelimiters(syntheticReference);
  return delimiters.length === tokens.length ? delimiters : null;
}

/** Resolves markdown delimiter literals for expanding HLMDPH sentinels in CAT display. */
export function resolveMarkdownDelimitersForDisplay(
  message: string,
  companion?: string,
  options?: MarkdownMarkupDisplayOptions,
): MarkdownDelimiter[] {
  const tokens = markdownMarkupSpans(message);
  if (tokens.length === 0) {
    return collectStandardMarkdownDelimiters(message);
  }
  if (!companion) {
    return [];
  }

  let delimiters = collectStandardMarkdownDelimiters(companion);
  if (delimiters.length === tokens.length) {
    return delimiters;
  }

  const reciprocal = expandMarkdownMarkupOneHop(companion, message);
  delimiters = collectStandardMarkdownDelimiters(reciprocal);
  if (delimiters.length === tokens.length) {
    return delimiters;
  }

  if (markdownMarkupSpans(companion).length === tokens.length) {
    const dual = resolveDualSentinelDelimiters(companion, message, options?.sourceMarkdown);
    if (dual && dual.length === tokens.length) {
      return dual;
    }
  }

  return [];
}

function formatMarkdownMarkupForDisplayInner(
  message: string,
  companion?: string,
  options?: MarkdownMarkupDisplayOptions,
): string {
  const tokens = markdownMarkupSpans(message);
  if (tokens.length === 0) {
    return message;
  }
  const delimiters = resolveMarkdownDelimitersForDisplay(message, companion, options);
  if (delimiters.length !== tokens.length) {
    return message;
  }
  return applyDelimitersToSentinels(message, tokens, delimiters);
}

export function expandMarkdownMarkupOneHopForDisplay(message: string, companion?: string): string {
  return expandMarkdownMarkupOneHop(message, companion);
}

export function recoverMarkdownMarkupTokens(source: string, target: string): string | null {
  const tokens = markdownMarkupSpans(source);
  if (tokens.length === 0) {
    return null;
  }
  const delimiters = collectStandardMarkdownDelimiters(target);
  if (delimiters.length !== tokens.length) {
    return null;
  }

  let recovered = target;
  for (let index = delimiters.length - 1; index >= 0; index -= 1) {
    const delimiter = delimiters[index]!;
    const token = tokens[index]!;
    recovered = `${recovered.slice(0, delimiter.start)}${token.literal}${recovered.slice(delimiter.end)}`;
  }
  return recovered;
}

/** Shows protected markdown as `[title](url)` when the companion side still has real delimiters. */
export function formatMarkdownMarkupForDisplay(
  message: string,
  companion?: string,
  options?: MarkdownMarkupDisplayOptions,
): string {
  return formatMarkdownMarkupForDisplayInner(message, companion, options);
}

export function expandDualSentinelSegment(
  message: string,
  reference: string,
  options?: MarkdownMarkupDisplayOptions,
): string {
  return formatMarkdownMarkupForDisplayInner(message, reference, options);
}

export function parseMarkdownLinkHrefsForDisplay(markdown: string): string[] {
  return parseMarkdownLinkHrefsInOrder(markdown);
}
