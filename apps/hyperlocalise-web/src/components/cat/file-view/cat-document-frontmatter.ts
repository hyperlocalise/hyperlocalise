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

export type CatDocumentFrontmatterField = {
  key: string;
  value: string;
};

export type SplitCatDocument = {
  fields: CatDocumentFrontmatterField[];
  body: string;
  hasFrontmatter: boolean;
  rawFrontmatter: string;
};

export function splitCatDocument(text: string): SplitCatDocument {
  const match = FRONTMATTER_PATTERN.exec(text);
  if (!match) {
    return { fields: [], body: text, hasFrontmatter: false, rawFrontmatter: "" };
  }

  const rawFrontmatter = match[1] ?? "";
  const fields: CatDocumentFrontmatterField[] = [];
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

export function joinCatDocument(input: {
  fields: CatDocumentFrontmatterField[];
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

function parseEditableScalarLine(line: string): CatDocumentFrontmatterField | null {
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
  return { key: field[1] ?? "", value: unquoteYamlScalar(rawValue) };
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

function patchRawFrontmatter(raw: string, fields: CatDocumentFrontmatterField[]) {
  const valuesByKey = new Map(
    fields
      .filter((field) => field.key.trim().length > 0)
      .map((field) => [field.key, field.value] as const),
  );
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const field = parseEditableScalarLine(line);
      if (!field || !valuesByKey.has(field.key)) {
        return line;
      }
      return `${field.key}: ${quoteYamlScalar(valuesByKey.get(field.key) ?? "")}`;
    })
    .join("\n");
}

function unquoteYamlScalar(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function quoteYamlScalar(value: string) {
  if (value === "" || /[:#{}[\],&*?|<>=!%@`]/.test(value) || value !== value.trim()) {
    return JSON.stringify(value);
  }
  return value;
}
