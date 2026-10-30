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

import type { HubspotJson } from "./document";

const PARTIAL_TAG = /\{%\s*include_dnd_partial\b([\s\S]*?)%\}/g;
const MODULE_ATTRIBUTE =
  /\{%\s*module_attribute\s+["']([A-Za-z0-9_]+)["']\s*%\}([\s\S]*?)\{%\s*end_module_attribute\s*%\}/g;
const FIELD_ATTRIBUTE =
  /\b(html|heading|title|subtitle|description|subheading|button_text|richtext|text|content|body)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\{\{[\s\S]*?\}\})/g;
const ALT_ATTRIBUTE = /["']alt["']\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;
const CONTEXT_DEFAULT =
  /\{\{\s*context\.([A-Za-z0-9_]+)\s+or\s+("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*\}\}/g;
const DND_AREA = /\{%\s*dnd_area\s+["']([^"']+)["']/;
const QUOTED = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;

const COPY_FIELDS = new Set([
  "html",
  "heading",
  "title",
  "subtitle",
  "description",
  "subheading",
  "button_text",
  "richtext",
  "text",
  "content",
  "body",
  "alt",
]);

export function resolveTemplatePath(fromFile: string, includePath: string): string {
  const raw = includePath.trim().replace(/^\/+/, "");
  if (raw.startsWith("@") || raw.startsWith("http")) {
    return raw;
  }
  const stack = fromFile.split("/").slice(0, -1);
  for (const part of raw.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}

export function listDndPartialPaths(source: string): string[] {
  PARTIAL_TAG.lastIndex = 0;
  const paths: string[] = [];
  for (const match of source.matchAll(PARTIAL_TAG)) {
    const path = readNamedString(match[1] ?? "", "path");
    if (path) {
      paths.push(path);
    }
  }
  return paths;
}

export function layoutSectionsFromTemplateFiles(
  files: ReadonlyMap<string, string>,
  entryPath: string,
): HubspotJson {
  const entry = files.get(entryPath);
  if (!entry) {
    return {};
  }
  const areaMatch = DND_AREA.exec(stripComments(entry));
  const area = areaMatch?.[1]?.trim() || "dnd_area";
  const inlined = inlinePartials(entry, entryPath, files, 0, new Set([entryPath]));
  const modules = collectModules(stripComments(inlined));
  if (modules.length === 0) {
    return {};
  }
  return {
    [area]: {
      cells: [],
      cssClass: "",
      cssId: "",
      cssStyle: "",
      label: area,
      name: area,
      params: {},
      rowMetaData: [],
      rows: modules.map((module, index) => ({
        0: moduleNode(area, index, module),
      })),
      type: "cell",
      w: 12,
      x: 0,
    },
  };
}

function moduleNode(
  area: string,
  index: number,
  module: { field: string; value: string },
): HubspotJson {
  const params: { [key: string]: HubspotJson } =
    module.field === "alt"
      ? {
          img: { alt: module.value },
          path: "@hubspot/linked_image",
          schema_version: 2,
        }
      : {
          html: module.field === "html" ? module.value : `<p>${escapeHtml(module.value)}</p>`,
          path: "@hubspot/rich_text",
          schema_version: 2,
        };
  return {
    cells: [],
    cssClass: "",
    cssId: "",
    cssStyle: "",
    name: `${area}-module-${index}`,
    params,
    rowMetaData: [],
    rows: [],
    type: "custom_widget",
    w: 12,
    x: 0,
  };
}

function inlinePartials(
  source: string,
  fromPath: string,
  files: ReadonlyMap<string, string>,
  depth: number,
  seen: Set<string>,
): string {
  if (depth > 4) {
    return source;
  }
  PARTIAL_TAG.lastIndex = 0;
  return source.replace(PARTIAL_TAG, (_full, body: string) => {
    const includePath = readNamedString(body, "path");
    if (!includePath) {
      return "";
    }
    const resolved = resolveTemplatePath(fromPath, includePath);
    if (seen.has(resolved)) {
      return "";
    }
    const partial = files.get(resolved);
    if (!partial) {
      return "";
    }
    const nextSeen = new Set(seen);
    nextSeen.add(resolved);
    const substituted = applyContext(partial, readContext(body));
    return inlinePartials(substituted, resolved, files, depth + 1, nextSeen);
  });
}

function collectModules(source: string): Array<{ field: string; value: string }> {
  MODULE_ATTRIBUTE.lastIndex = 0;
  FIELD_ATTRIBUTE.lastIndex = 0;
  ALT_ATTRIBUTE.lastIndex = 0;
  const modules: Array<{ field: string; value: string }> = [];
  const occupied: Array<{ start: number; end: number }> = [];
  for (const match of source.matchAll(MODULE_ATTRIBUTE)) {
    const field = (match[1] ?? "").toLowerCase();
    const value = (match[2] ?? "").trim();
    if (match.index !== undefined) {
      occupied.push({ start: match.index, end: match.index + match[0].length });
    }
    pushModule(modules, field, value);
  }
  for (const match of source.matchAll(FIELD_ATTRIBUTE)) {
    if (
      match.index !== undefined &&
      occupied.some((span) => match.index! >= span.start && match.index! < span.end)
    ) {
      continue;
    }
    pushModule(modules, (match[1] ?? "").toLowerCase(), readAttributeValue(match[2] ?? ""));
  }
  for (const match of source.matchAll(ALT_ATTRIBUTE)) {
    if (
      match.index !== undefined &&
      occupied.some((span) => match.index! >= span.start && match.index! < span.end)
    ) {
      continue;
    }
    pushModule(modules, "alt", readAttributeValue(match[1] ?? ""));
  }
  return modules;
}

function pushModule(
  modules: Array<{ field: string; value: string }>,
  field: string,
  value: string,
): void {
  if (!COPY_FIELDS.has(field) || !isTemplateProse(value)) {
    return;
  }
  modules.push({ field, value: value.trim() });
}

function applyContext(source: string, context: { [key: string]: string }): string {
  return source.replace(CONTEXT_DEFAULT, (_full, key: string, quoted: string) => {
    return JSON.stringify(context[key] ?? unescapeQuoted(quoted));
  });
}

function readContext(body: string): { [key: string]: string } {
  const start = body.search(/\bcontext\s*=\s*\{/);
  if (start < 0) {
    return {};
  }
  const brace = body.indexOf("{", start);
  const object = body.slice(brace + 1, closingBrace(body, brace));
  const context: { [key: string]: string } = {};
  const pair = /["']([A-Za-z0-9_]+)["']\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;
  for (const match of object.matchAll(pair)) {
    const key = match[1] ?? "";
    const quoted = match[2] ?? "";
    if (key && quoted) {
      context[key] = unescapeQuoted(quoted);
    }
  }
  return context;
}

function closingBrace(source: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return source.length;
}

function readNamedString(body: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')`).exec(
    body,
  );
  if (!match?.[1]) {
    return null;
  }
  return unescapeQuoted(match[1]);
}

function readAttributeValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{{")) {
    QUOTED.lastIndex = 0;
    const quoted = QUOTED.exec(trimmed);
    QUOTED.lastIndex = 0;
    return quoted ? unescapeQuoted(quoted[0]) : "";
  }
  return trimmed.startsWith('"') || trimmed.startsWith("'") ? unescapeQuoted(trimmed) : "";
}

function unescapeQuoted(raw: string): string {
  const body = raw.slice(1, -1);
  return body.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'");
}

function stripComments(source: string): string {
  return source.replace(/\{#[\s\S]*?#\}/g, "");
}

function isTemplateProse(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.includes("{{")) {
    return false;
  }
  if (/^(https?:|mailto:|tel:|#|@|\.\.?\/)/i.test(trimmed)) {
    return false;
  }
  if (/\.(html|css|js|png|jpe?g|svg|gif|webp)$/i.test(trimmed)) {
    return false;
  }
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) {
    return false;
  }
  if (/<[^>]+>/.test(trimmed)) {
    return true;
  }
  return /\s/.test(trimmed);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
