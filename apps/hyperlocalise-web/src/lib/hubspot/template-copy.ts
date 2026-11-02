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

const INCLUDE_TAG =
  /\{%\s*(include_dnd_partial|global_partial|dnd_partial|include|extends)\b([\s\S]*?)%\}/g;
const TEXT_TAG = /\{%\s*(?:text|textarea|rich_text)\b([\s\S]*?)%\}/g;
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
  INCLUDE_TAG.lastIndex = 0;
  const paths: string[] = [];
  for (const match of source.matchAll(INCLUDE_TAG)) {
    const path = includePathFromTag(match[1] ?? "", match[2] ?? "");
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

const DND_BLOCKS = new Set(["dnd_area", "dnd_section"]);
const TEXT_FIELD_TYPES = new Set(["text", "textarea", "richtext"]);
const MODULE_OPEN = /\{%\s*module\s+["']([^"']+)["']([\s\S]*?)%\}/g;

type StaticModuleTag = {
  name: string;
  modulePath: string;
  overrides: Array<{ field: string; value: string }>;
};

/** `fields.json` paths for static `{% module %}` tags outside drag-and-drop areas. */
export function listStaticModuleFieldPaths(source: string, fromPath: string): string[] {
  const paths: string[] = [];
  for (const moduleTag of parseStaticModules(stripDndBlocks(source))) {
    const fieldsPath = staticModuleFieldsPath(fromPath, moduleTag.modulePath);
    if (fieldsPath) {
      paths.push(fieldsPath);
    }
  }
  return paths;
}

/** Widget bodies for static modules. Tag attributes override `fields.json` defaults. */
export function staticModuleWidgetsFromTemplateFiles(
  files: ReadonlyMap<string, string>,
  entryPath: string,
): HubspotJson {
  const widgets: { [key: string]: HubspotJson } = {};
  collectStaticModuleWidgets(files.get(entryPath) ?? "", entryPath, files, widgets, new Set(), 0);
  return widgets;
}

function collectStaticModuleWidgets(
  source: string,
  fromPath: string,
  files: ReadonlyMap<string, string>,
  widgets: { [key: string]: HubspotJson },
  seen: Set<string>,
  depth: number,
): void {
  if (!source || depth > 4 || seen.has(fromPath)) {
    return;
  }
  seen.add(fromPath);
  const outsideDnd = stripDndBlocks(source);
  for (const moduleTag of parseStaticModules(outsideDnd)) {
    if (widgets[moduleTag.name]) {
      continue;
    }
    const body = fieldDefaults(files, fromPath, moduleTag.modulePath);
    applyFieldOverrides(body, moduleTag.overrides);
    if (Object.keys(body).length === 0) {
      continue;
    }
    widgets[moduleTag.name] = {
      body,
      id: moduleTag.name,
      name: moduleTag.name,
      type: "module",
    };
  }
  for (const includePath of listDndPartialPaths(outsideDnd)) {
    const resolved = resolveTemplatePath(fromPath, includePath);
    const partial = files.get(resolved);
    if (!partial) {
      continue;
    }
    collectStaticModuleWidgets(partial, resolved, files, widgets, seen, depth + 1);
  }
}

function staticModuleFieldsPath(fromPath: string, modulePath: string): string | null {
  const raw = modulePath.trim();
  if (!raw || raw.startsWith("@") || raw.startsWith("http")) {
    return null;
  }
  const resolved = resolveTemplatePath(fromPath, raw);
  return resolved.endsWith(".module") ? `${resolved}/fields.json` : null;
}

function parseStaticModules(source: string): StaticModuleTag[] {
  MODULE_OPEN.lastIndex = 0;
  const modules: StaticModuleTag[] = [];
  for (const match of source.matchAll(MODULE_OPEN)) {
    const name = (match[1] ?? "").trim();
    const attrs = match[2] ?? "";
    if (!name || match.index === undefined) {
      continue;
    }
    const inner = moduleInner(source, match.index + match[0].length);
    modules.push({
      name,
      modulePath: readNamedString(attrs, "path") ?? "",
      overrides: [...attributeOverrides(attrs), ...moduleAttributeOverrides(inner)],
    });
  }
  MODULE_OPEN.lastIndex = 0;
  return modules;
}

function moduleInner(source: string, openEnd: number): string {
  const close = /\{%\s*end_module\s*%\}/.exec(source.slice(openEnd));
  if (!close || close.index === undefined) {
    return "";
  }
  const between = source.slice(openEnd, openEnd + close.index);
  const leftover = between
    .replace(/\{%\s*module_attribute\b[\s\S]*?\{%\s*end_module_attribute\s*%\}/g, "")
    .trim();
  return leftover ? "" : between;
}

function attributeOverrides(attrs: string): Array<{ field: string; value: string }> {
  FIELD_ATTRIBUTE.lastIndex = 0;
  const overrides: Array<{ field: string; value: string }> = [];
  for (const match of attrs.matchAll(FIELD_ATTRIBUTE)) {
    pushOverride(overrides, (match[1] ?? "").toLowerCase(), readAttributeValue(match[2] ?? ""));
  }
  FIELD_ATTRIBUTE.lastIndex = 0;
  return overrides;
}

function moduleAttributeOverrides(inner: string): Array<{ field: string; value: string }> {
  if (!inner) {
    return [];
  }
  MODULE_ATTRIBUTE.lastIndex = 0;
  const overrides: Array<{ field: string; value: string }> = [];
  for (const match of inner.matchAll(MODULE_ATTRIBUTE)) {
    pushOverride(overrides, (match[1] ?? "").toLowerCase(), match[2] ?? "");
  }
  MODULE_ATTRIBUTE.lastIndex = 0;
  return overrides;
}

function pushOverride(
  overrides: Array<{ field: string; value: string }>,
  field: string,
  value: string,
): void {
  const trimmed = value.trim();
  if (!COPY_FIELDS.has(field) || !isTemplateProse(trimmed)) {
    return;
  }
  overrides.push({ field, value: trimmed });
}

function fieldDefaults(
  files: ReadonlyMap<string, string>,
  fromPath: string,
  modulePath: string,
): { [key: string]: HubspotJson } {
  const fieldsPath = staticModuleFieldsPath(fromPath, modulePath);
  if (!fieldsPath) {
    return {};
  }
  const raw = files.get(fieldsPath);
  return raw ? defaultsFromFieldsJson(raw) : {};
}

function defaultsFromFieldsJson(raw: string): { [key: string]: HubspotJson } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  const fields = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { fields?: unknown }).fields)
      ? (parsed as { fields: unknown[] }).fields
      : null;
  return fields ? readFieldList(fields) : {};
}

function readFieldList(fields: unknown[]): { [key: string]: HubspotJson } {
  const out: { [key: string]: HubspotJson } = {};
  for (const field of fields) {
    if (!field || typeof field !== "object") {
      continue;
    }
    const record = field as {
      name?: unknown;
      type?: unknown;
      default?: unknown;
      children?: unknown;
    };
    if (typeof record.name !== "string" || !record.name.trim()) {
      continue;
    }
    const type = typeof record.type === "string" ? record.type.toLowerCase() : "";
    if (type === "group" && Array.isArray(record.children)) {
      const nested = readFieldList(record.children);
      if (Object.keys(nested).length > 0) {
        out[record.name] = nested;
      }
      continue;
    }
    if (!TEXT_FIELD_TYPES.has(type) || typeof record.default !== "string") {
      continue;
    }
    if (!isTemplateProse(record.default)) {
      continue;
    }
    out[record.name] = record.default.trim();
  }
  return out;
}

function applyFieldOverrides(
  body: { [key: string]: HubspotJson },
  overrides: Array<{ field: string; value: string }>,
): void {
  for (const override of overrides) {
    if (!assignField(body, override.field, override.value)) {
      body[override.field] = override.value;
    }
  }
}

function assignField(node: { [key: string]: HubspotJson }, field: string, value: string): boolean {
  if (typeof node[field] === "string") {
    node[field] = value;
    return true;
  }
  for (const child of Object.values(node)) {
    if (child && typeof child === "object" && !Array.isArray(child)) {
      if (assignField(child as { [key: string]: HubspotJson }, field, value)) {
        return true;
      }
    }
  }
  return false;
}

function stripDndBlocks(source: string): string {
  const tags: Array<{ closing: boolean; name: string; start: number; end: number }> = [];
  const tagPattern = /\{%\s*(end_)?([A-Za-z0-9_]+)\b[\s\S]*?%\}/g;
  for (const match of source.matchAll(tagPattern)) {
    if (match.index === undefined) {
      continue;
    }
    tags.push({
      closing: Boolean(match[1]),
      name: match[2] ?? "",
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  const ranges: Array<[number, number]> = [];
  const stack: Array<{ name: string; start: number }> = [];
  for (const tag of tags) {
    if (tag.closing) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index]?.name !== tag.name) {
          continue;
        }
        const open = stack[index];
        stack.splice(index);
        if (open && DND_BLOCKS.has(tag.name)) {
          ranges.push([open.start, tag.end]);
        }
        break;
      }
      continue;
    }
    stack.push({ name: tag.name, start: tag.start });
  }
  if (ranges.length === 0) {
    return source;
  }
  ranges.sort((left, right) => left[0] - right[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] >= last[0] && range[0] < last[1]) {
      last[1] = Math.max(last[1], range[1]);
      continue;
    }
    merged.push([range[0], range[1]]);
  }
  let next = source;
  for (const [start, end] of merged.toReversed()) {
    next = next.slice(0, start) + next.slice(end);
  }
  return next;
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
  INCLUDE_TAG.lastIndex = 0;
  return source.replace(INCLUDE_TAG, (_full, tag: string, body: string) => {
    const includePath = includePathFromTag(tag, body);
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
  TEXT_TAG.lastIndex = 0;
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
  for (const match of source.matchAll(TEXT_TAG)) {
    pushModule(modules, "text", readNamedString(match[1] ?? "", "value") ?? "");
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

function includePathFromTag(tag: string, body: string): string | null {
  const named = readNamedString(body, "path");
  if (named) {
    return named;
  }
  if (tag === "extends" || tag === "include" || tag === "global_partial" || tag === "dnd_partial") {
    const quoted = /["']([^"']+)["']/.exec(body);
    return quoted?.[1] ?? null;
  }
  return null;
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
