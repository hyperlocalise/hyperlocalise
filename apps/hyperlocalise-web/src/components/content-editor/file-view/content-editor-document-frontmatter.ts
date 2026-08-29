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

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const SIMPLE_FIELD_PATTERN = /^([A-Za-z0-9_-]+):\s*(.*)$/;

export type ContentEditorDocumentFrontmatterField = {
  key: string;
  value: string;
  rawValue?: string;
};

export type SplitContentEditorDocument = {
  fields: ContentEditorDocumentFrontmatterField[];
  body: string;
  hasFrontmatter: boolean;
  rawFrontmatter: string;
};

export function splitContentEditorDocument(text: string): SplitContentEditorDocument {
  const match = FRONTMATTER_PATTERN.exec(text);
  if (!match) {
    return { fields: [], body: text, hasFrontmatter: false, rawFrontmatter: "" };
  }

  const rawFrontmatter = match[1] ?? "";
  const fields: ContentEditorDocumentFrontmatterField[] = [];
  for (const line of rawFrontmatter.split(/\r?\n/)) {
    const field = parseEditableScalarLine(line);
    if (!field) {
      continue;
    }
    fields.push(field);
  }

  return {
    fields,
    body: text.slice(match[0].length),
    hasFrontmatter: true,
    rawFrontmatter,
  };
}

export function joinContentEditorDocument(input: {
  fields: ContentEditorDocumentFrontmatterField[];
  body: string;
  hasFrontmatter: boolean;
  rawFrontmatter?: string;
}): string {
  const body = input.body.replace(/^\n+/, "");
  if (!input.hasFrontmatter) {
    return input.body;
  }

  const yaml = input.rawFrontmatter
    ? patchRawFrontmatter(input.rawFrontmatter, input.fields)
    : input.fields
        .filter((field) => field.key.trim().length > 0)
        .map((field) => `${field.key}: ${quoteYamlScalar(field.value)}`)
        .join("\n");

  if (!yaml) {
    return `---\n---\n${body}`;
  }

  return `---\n${yaml}\n---\n${body}`;
}

function parseEditableScalarLine(line: string): ContentEditorDocumentFrontmatterField | null {
  if (/^\s/.test(line)) {
    return null;
  }
  const field = SIMPLE_FIELD_PATTERN.exec(line);
  if (!field) {
    return null;
  }
  const rawValue = (field[2] ?? "").trim();
  if (!isPlainYamlScalar(rawValue)) {
    return null;
  }
  return { key: field[1] ?? "", value: unquoteYamlScalar(rawValue), rawValue };
}

function isPlainYamlScalar(value: string) {
  if (!value) {
    return false;
  }
  if (
    value.startsWith("|") ||
    value.startsWith(">") ||
    value.startsWith("[") ||
    value.startsWith("{") ||
    value.startsWith("&") ||
    value.startsWith("*")
  ) {
    return false;
  }
  return true;
}

function patchRawFrontmatter(raw: string, fields: ContentEditorDocumentFrontmatterField[]) {
  const valuesByKey = new Map(
    fields
      .filter((field) => field.key.trim().length > 0)
      .map((field) => [field.key, field] as const),
  );
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const field = parseEditableScalarLine(line);
      const next = field ? valuesByKey.get(field.key) : undefined;
      if (!field || !next) {
        return line;
      }
      if (next.value === field.value) {
        return line;
      }
      return `${field.key}: ${quoteYamlScalar(next.value)}`;
    })
    .join("\n");
}

function unescapeDoubleQuotedYaml(inner: string) {
  return inner
    .replaceAll("\\\\", "\u0000")
    .replaceAll("\\n", "\n")
    .replaceAll("\\t", "\t")
    .replaceAll("\\r", "\r")
    .replaceAll('\\"', '"')
    .replaceAll("\u0000", "\\");
}

function unquoteYamlScalar(value: string) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") {
        return parsed;
      }
    } catch {
      // YAML double-quoted scalars are JSON-like; fall back to common escapes.
    }
    return unescapeDoubleQuotedYaml(trimmed.slice(1, -1));
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  return trimmed;
}

function quoteYamlScalar(value: string) {
  if (
    value === "" ||
    value !== value.trim() ||
    /[\n\r\t:#{}[\],&*?|<>=!%@`]/.test(value) ||
    isYamlAmbiguousScalar(value)
  ) {
    return JSON.stringify(value);
  }
  return value;
}

function isYamlAmbiguousScalar(value: string) {
  if (/^(?:true|false|null|yes|no|on|off|~)$/i.test(value)) {
    return true;
  }
  if (/^-?0\d/.test(value)) {
    return true;
  }
  return /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value);
}
