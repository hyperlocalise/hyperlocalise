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

export interface InterpolationPlaceholder {
  name: string;
  literal: string;
  format: string;
  start: number;
  end: number;
  triple: boolean;
  unescape: boolean;
}

const ICU_INTERPOLATION_FORMATS = new Set(["plural", "select", "selectordinal"]);

function isPlaceholderName(value: string) {
  if (value === "") {
    return false;
  }
  return /^[\p{L}$_0-9](?:[\p{L}$_0-9.-]|\[\d+\])*$/u.test(value);
}

function interpolationFormatIsICU(format: string) {
  const firstToken = format.split(",")[0]?.trim() ?? "";
  const first = firstToken.includes("(") ? firstToken.slice(0, firstToken.indexOf("(")) : firstToken;
  return ICU_INTERPOLATION_FORMATS.has(first.toLowerCase());
}

function isSimpleInterpolationFormat(format: string) {
  return format !== "" && isPlaceholderName(format) && !format.includes(".") && !format.includes("[");
}

function splitInterpolation(interior: string) {
  let body = interior.trim();
  let unescape = false;
  if (body.startsWith("-")) {
    unescape = true;
    body = body.slice(1).trim();
  }

  const comma = body.indexOf(",");
  const name = (comma === -1 ? body : body.slice(0, comma)).trim();
  if (!isPlaceholderName(name)) {
    return null;
  }
  if (comma === -1) {
    return { name, format: "", unescape };
  }

  const format = body.slice(comma + 1).trim();
  if (interpolationFormatIsICU(format)) {
    return null;
  }
  return { name, format, unescape };
}

function normalizeInterpolationLiteral(
  triple: boolean,
  unescape: boolean,
  name: string,
  format: string,
) {
  if (triple) {
    return `{{{${name}}}}`;
  }
  const prefix = unescape ? "-" : "";
  const suffix = isSimpleInterpolationFormat(format) ? `, ${format}` : "";
  return `{{${prefix}${name}${suffix}}}`;
}

function interpolationAt(message: string, index: number): InterpolationPlaceholder | null {
  if (message[index] !== "{" || message[index + 1] !== "{") {
    return null;
  }

  const triple = message[index + 2] === "{";
  const openLen = triple ? 3 : 2;
  let close = index + openLen;
  while (close < message.length && message[close] !== "}") {
    close += 1;
  }
  for (let offset = 0; offset < openLen; offset += 1) {
    if (message[close + offset] !== "}") {
      return null;
    }
  }

  const parsed = splitInterpolation(message.slice(index + openLen, close));
  if (!parsed) {
    return null;
  }

  return {
    name: parsed.name,
    literal: normalizeInterpolationLiteral(triple, parsed.unescape, parsed.name, parsed.format),
    format: parsed.format,
    start: index,
    end: close + openLen,
    triple,
    unescape: parsed.unescape,
  };
}

/** Mustache and i18next interpolations. Nested ICU `{{count, plural, ...}}` is skipped. */
export function extractInterpolationPlaceholders(message: string): InterpolationPlaceholder[] {
  if (!message.includes("{{")) {
    return [];
  }

  const spans: InterpolationPlaceholder[] = [];
  for (let index = 0; index < message.length; ) {
    const open = message.indexOf("{{", index);
    if (open === -1) {
      break;
    }
    const span = interpolationAt(message, open);
    if (span) {
      spans.push(span);
      index = span.end;
      continue;
    }
    index = open + 1;
  }
  return spans;
}

export function maskInterpolationPlaceholders(
  message: string,
  spans: readonly InterpolationPlaceholder[],
) {
  if (spans.length === 0) {
    return message;
  }

  let masked = "";
  let last = 0;
  for (const span of spans) {
    masked += message.slice(last, span.start);
    masked += " ".repeat(span.end - span.start);
    last = span.end;
  }
  return masked + message.slice(last);
}

const I18NEXT_NESTING_PATTERN = /\$t\([A-Za-z_][\w./:-]*\)/g;

export function extractI18nextNestingPlaceholders(message: string) {
  if (!message.includes("$t(")) {
    return [];
  }
  return [...message.matchAll(I18NEXT_NESTING_PATTERN)].map((match) => match[0]!);
}
