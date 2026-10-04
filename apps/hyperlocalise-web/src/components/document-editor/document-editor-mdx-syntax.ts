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
export type JsxOpenTag = {
  name: string;
  raw: string;
  selfClosing: boolean;
  /** Index just past the closing `>`. */
  end: number;
};

export type JsxStringProp = { name: string; value: string };

const TAG_NAME_PATTERN = /^[A-Za-z][\w.-]*/;
const STRING_PROP_PATTERN = /(\s)([A-Za-z_][\w-]*)=(["'])((?:(?!\3)[^\\]|\\.)*)\3/g;

function isTagNameBoundary(char: string | undefined) {
  return char === undefined || char === ">" || char === "/" || /\s/.test(char);
}

/** Index just past the `}` matching the `{` at `start`, skipping strings. */
export function readBalancedBraces(src: string, start: number): number | null {
  if (src[start] !== "{") {
    return null;
  }
  let depth = 0;
  let quote: string | null = null;
  for (let index = start; index < src.length; index += 1) {
    const char = src[index];
    if (quote) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return null;
}

export function readJsxOpenTag(src: string, start = 0): JsxOpenTag | null {
  if (src[start] !== "<") {
    return null;
  }
  const nameMatch = TAG_NAME_PATTERN.exec(src.slice(start + 1));
  if (!nameMatch) {
    return null;
  }
  const name = nameMatch[0];
  if (!isTagNameBoundary(src[start + 1 + name.length])) {
    return null;
  }
  let quote: string | null = null;
  for (let index = start + 1 + name.length; index < src.length; index += 1) {
    const char = src[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "{") {
      const end = readBalancedBraces(src, index);
      if (end === null) {
        return null;
      }
      index = end - 1;
    } else if (char === ">") {
      const raw = src.slice(start, index + 1);
      return { name, raw, selfClosing: /\/\s*>$/.test(raw), end: index + 1 };
    }
  }
  return null;
}

/** Finds the `</name>` closing the element whose open tag ends at `from`. */
export function findJsxClosingTag(
  src: string,
  name: string,
  from: number,
): { start: number; end: number } | null {
  const closing = `</${name}`;
  let depth = 1;
  let index = from;
  while (index < src.length) {
    const next = src.indexOf("<", index);
    if (next === -1) {
      return null;
    }
    if (src.startsWith(closing, next) && isTagNameBoundary(src[next + closing.length])) {
      const end = src.indexOf(">", next);
      if (end === -1) {
        return null;
      }
      depth -= 1;
      if (depth === 0) {
        return { start: next, end: end + 1 };
      }
      index = end + 1;
      continue;
    }
    const open = readJsxOpenTag(src, next);
    if (open && open.name === name && !open.selfClosing) {
      depth += 1;
    }
    index = open ? open.end : next + 1;
  }
  return null;
}

export function readJsxStringProps(openTag: string): JsxStringProp[] {
  const props: JsxStringProp[] = [];
  for (const match of openTag.matchAll(STRING_PROP_PATTERN)) {
    props.push({ name: match[2], value: match[4].replace(/\\(.)/g, "$1") });
  }
  return props;
}

/** Rewrites one string prop in place, keeping the rest of the tag as written. */
export function writeJsxStringProp(openTag: string, name: string, value: string) {
  return openTag.replace(STRING_PROP_PATTERN, (whole, space, propName, quote) => {
    if (propName !== name) {
      return whole;
    }
    const escaped = value.replace(/\\/g, "\\\\").replaceAll(quote, `\\${quote}`);
    return `${space}${propName}=${quote}${escaped}${quote}`;
  });
}

export function commonIndent(text: string) {
  let indent: string | null = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const lead = /^[ \t]*/.exec(line)?.[0] ?? "";
    if (indent === null || lead.length < indent.length) {
      indent = lead;
    }
  }
  return indent ?? "";
}

export function dedentLines(text: string, indent: string) {
  if (!indent) {
    return text;
  }
  return text
    .split("\n")
    .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line.trimStart()))
    .join("\n");
}

export function indentLines(text: string, indent: string) {
  if (!indent) {
    return text;
  }
  return text
    .split("\n")
    .map((line) => (line.trim() ? `${indent}${line}` : line))
    .join("\n");
}
