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
};

export function splitCatDocument(text: string): SplitCatDocument {
  const match = FRONTMATTER_PATTERN.exec(text);
  if (!match) {
    return { fields: [], body: text, hasFrontmatter: false };
  }

  const raw = match[1] ?? "";
  const fields: CatDocumentFrontmatterField[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const field = SIMPLE_FIELD_PATTERN.exec(line);
    if (!field) {
      continue;
    }
    fields.push({ key: field[1] ?? "", value: unquoteYamlScalar(field[2] ?? "") });
  }

  return {
    fields,
    body: text.slice(match[0].length),
    hasFrontmatter: true,
  };
}

export function joinCatDocument(input: {
  fields: CatDocumentFrontmatterField[];
  body: string;
  hasFrontmatter: boolean;
}): string {
  const body = input.body.replace(/^\n+/, "");
  if (!input.hasFrontmatter) {
    return input.body;
  }

  const yaml = input.fields
    .filter((field) => field.key.trim().length > 0)
    .map((field) => `${field.key}: ${quoteYamlScalar(field.value)}`)
    .join("\n");

  if (!yaml) {
    return `---\n---\n${body}`;
  }

  return `---\n${yaml}\n---\n${body}`;
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
