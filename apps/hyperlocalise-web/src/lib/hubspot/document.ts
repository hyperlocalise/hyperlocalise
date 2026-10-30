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

/** Nested translatable strings. Keys are locked ids; values are copy. */
export type HubspotStringTree = { [key: string]: string | HubspotStringTree };

const LOCKED_KEYS = new Set([
  "id",
  "url",
  "href",
  "src",
  "color",
  "background",
  "backgroundcolor",
  "background_color",
  "css",
  "cssclass",
  "css_class",
  "path",
  "width",
  "height",
  "hidden",
  "required",
  "fieldtype",
  "type",
  "objecttypeid",
  "name",
  "value",
  "defaultvalue",
]);

const PREVIEW_KEYS = new Set(["preview_text", "previewtext", "preview"]);
const URL_VALUE = /^(https?:|mailto:|tel:)/i;
const COLOR_VALUE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function isLockedKey(key: string): boolean {
  return LOCKED_KEYS.has(key.trim().toLowerCase());
}

function isCopyString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (URL_VALUE.test(trimmed) || COLOR_VALUE.test(trimmed)) {
    return false;
  }
  return true;
}

export function collectCopyTree(value: unknown): HubspotStringTree {
  const tree: HubspotStringTree = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return tree;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (isLockedKey(key) || PREVIEW_KEYS.has(key.trim().toLowerCase())) {
      continue;
    }
    if (typeof entry === "string") {
      if (isCopyString(entry)) {
        tree[key] = entry;
      }
      continue;
    }
    const nested = collectCopyTree(entry);
    if (Object.keys(nested).length > 0) {
      tree[key] = nested;
    }
  }
  return tree;
}

export function applyStringTree(target: unknown, tree: HubspotStringTree): void {
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    return;
  }
  const record = target as Record<string, unknown>;
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === "string") {
      if (typeof record[key] === "string") {
        record[key] = value;
      }
      continue;
    }
    applyStringTree(record[key], value);
  }
}

function takePreviewText(widgets: unknown): { previewText: string; widgets: unknown } {
  const clone = structuredClone(widgets ?? {});
  let previewText = "";
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (
        !previewText &&
        PREVIEW_KEYS.has(key.trim().toLowerCase()) &&
        typeof value === "string" &&
        isCopyString(value)
      ) {
        previewText = value;
        delete (node as Record<string, unknown>)[key];
        continue;
      }
      visit(value);
    }
  };
  visit(clone);
  return { previewText, widgets: clone };
}

export function writePreviewText(widgets: unknown, previewText: string): void {
  if (!previewText || !widgets || typeof widgets !== "object") {
    return;
  }
  const visit = (node: unknown): boolean => {
    if (!node || typeof node !== "object") {
      return false;
    }
    if (Array.isArray(node)) {
      return node.some((item) => visit(item));
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (PREVIEW_KEYS.has(key.trim().toLowerCase()) && typeof value === "string") {
        (node as Record<string, unknown>)[key] = previewText;
        return true;
      }
      if (visit(value)) {
        return true;
      }
    }
    return false;
  };
  visit(widgets);
}

export function buildEmailDocument(input: {
  subject: string;
  widgets: unknown;
}): HubspotStringTree {
  const document: HubspotStringTree = {};
  if (isCopyString(input.subject)) {
    document.subject = input.subject;
  }
  const { previewText, widgets } = takePreviewText(input.widgets);
  if (previewText) {
    document.previewText = previewText;
  }
  const widgetCopy = collectCopyTree(widgets);
  if (Object.keys(widgetCopy).length > 0) {
    document.widgets = widgetCopy;
  }
  return document;
}

export function buildPageDocument(input: {
  htmlTitle: string;
  metaDescription: string;
  featuredImageAltText: string;
  widgets: unknown;
  layoutSections: unknown;
}): HubspotStringTree {
  const document: HubspotStringTree = {};
  if (isCopyString(input.htmlTitle)) {
    document.htmlTitle = input.htmlTitle;
  }
  if (isCopyString(input.metaDescription)) {
    document.metaDescription = input.metaDescription;
  }
  if (isCopyString(input.featuredImageAltText)) {
    document.featuredImageAltText = input.featuredImageAltText;
  }
  const widgets = collectCopyTree(input.widgets);
  if (Object.keys(widgets).length > 0) {
    document.widgets = widgets;
  }
  const layoutSections = collectCopyTree(input.layoutSections);
  if (Object.keys(layoutSections).length > 0) {
    document.layoutSections = layoutSections;
  }
  return document;
}

export function applyPageDocument(
  live: {
    htmlTitle: string;
    metaDescription: string;
    featuredImageAltText: string;
    widgets: unknown;
    layoutSections: unknown;
  },
  translated: HubspotStringTree,
): {
  htmlTitle: string;
  metaDescription: string;
  featuredImageAltText: string;
  widgets: unknown;
  layoutSections: unknown;
} {
  const widgets = structuredClone(live.widgets ?? {});
  const layoutSections = structuredClone(live.layoutSections ?? {});
  if (translated.widgets && typeof translated.widgets !== "string") {
    applyStringTree(widgets, translated.widgets);
  }
  if (translated.layoutSections && typeof translated.layoutSections !== "string") {
    applyStringTree(layoutSections, translated.layoutSections);
  }
  return {
    htmlTitle: typeof translated.htmlTitle === "string" ? translated.htmlTitle : live.htmlTitle,
    metaDescription:
      typeof translated.metaDescription === "string"
        ? translated.metaDescription
        : live.metaDescription,
    featuredImageAltText:
      typeof translated.featuredImageAltText === "string"
        ? translated.featuredImageAltText
        : live.featuredImageAltText,
    widgets,
    layoutSections,
  };
}

export function applyEmailDocument(
  widgets: unknown,
  translated: HubspotStringTree,
): { subject: string; widgets: unknown } {
  const nextWidgets = structuredClone(widgets ?? {});
  const widgetCopy = translated.widgets;
  if (widgetCopy && typeof widgetCopy !== "string") {
    applyStringTree(nextWidgets, widgetCopy);
  }
  const previewText = translated.previewText;
  if (typeof previewText === "string") {
    writePreviewText(nextWidgets, previewText);
  }
  const subject = typeof translated.subject === "string" ? translated.subject : "";
  return { subject, widgets: nextWidgets };
}

type FormField = {
  name?: unknown;
  label?: unknown;
  placeholder?: unknown;
  description?: unknown;
  options?: unknown;
};

export function buildFormDocument(definition: Record<string, unknown>): HubspotStringTree {
  const document: HubspotStringTree = {};
  const display = definition.displayOptions;
  if (display && typeof display === "object" && !Array.isArray(display)) {
    const submit = (display as { submitButtonText?: unknown }).submitButtonText;
    if (typeof submit === "string" && isCopyString(submit)) {
      document.submitText = submit;
    }
  }

  const fields: HubspotStringTree = {};
  const groups: HubspotStringTree = {};
  const fieldGroups = Array.isArray(definition.fieldGroups) ? definition.fieldGroups : [];
  fieldGroups.forEach((group, index) => {
    if (!group || typeof group !== "object" || Array.isArray(group)) {
      return;
    }
    const richText = (group as { richText?: unknown }).richText;
    if (typeof richText === "string" && isCopyString(richText)) {
      groups[String(index)] = { richText };
    }
    const groupFields = (group as { fields?: unknown }).fields;
    if (!Array.isArray(groupFields)) {
      return;
    }
    for (const field of groupFields) {
      if (!field || typeof field !== "object" || Array.isArray(field)) {
        continue;
      }
      const named = field as FormField;
      if (typeof named.name !== "string" || !named.name.trim()) {
        continue;
      }
      const entry: HubspotStringTree = {};
      for (const key of ["label", "placeholder", "description"] as const) {
        const value = named[key];
        if (typeof value === "string" && isCopyString(value)) {
          entry[key] = value;
        }
      }
      if (Array.isArray(named.options)) {
        const options: HubspotStringTree = {};
        for (const option of named.options) {
          if (!option || typeof option !== "object" || Array.isArray(option)) {
            continue;
          }
          const optionValue = (option as { value?: unknown }).value;
          const optionLabel = (option as { label?: unknown }).label;
          if (
            typeof optionValue === "string" &&
            optionValue.trim() &&
            typeof optionLabel === "string" &&
            isCopyString(optionLabel)
          ) {
            options[optionValue] = optionLabel;
          }
        }
        if (Object.keys(options).length > 0) {
          entry.options = options;
        }
      }
      if (Object.keys(entry).length > 0) {
        fields[named.name] = entry;
      }
    }
  });
  if (Object.keys(fields).length > 0) {
    document.fields = fields;
  }
  if (Object.keys(groups).length > 0) {
    document.groups = groups;
  }
  const legal = collectCopyTree(definition.legalConsentOptions);
  if (Object.keys(legal).length > 0) {
    document.legal = legal;
  }
  return document;
}

export function applyFormDocument(
  definition: Record<string, unknown>,
  translated: HubspotStringTree,
): Record<string, unknown> {
  const next = structuredClone(definition);
  if (typeof translated.submitText === "string") {
    const display = next.displayOptions;
    if (display && typeof display === "object" && !Array.isArray(display)) {
      (display as { submitButtonText?: string }).submitButtonText = translated.submitText;
    }
  }
  const fieldCopy = translated.fields;
  const groupCopy = translated.groups;
  const fieldGroups = Array.isArray(next.fieldGroups) ? next.fieldGroups : [];
  fieldGroups.forEach((group, index) => {
    if (!group || typeof group !== "object" || Array.isArray(group)) {
      return;
    }
    const groupEntry =
      groupCopy && typeof groupCopy !== "string" ? groupCopy[String(index)] : undefined;
    if (groupEntry && typeof groupEntry !== "string" && typeof groupEntry.richText === "string") {
      (group as { richText?: string }).richText = groupEntry.richText;
    }
    const groupFields = (group as { fields?: unknown }).fields;
    if (!fieldCopy || typeof fieldCopy === "string" || !Array.isArray(groupFields)) {
      return;
    }
    for (const field of groupFields) {
      if (!field || typeof field !== "object" || Array.isArray(field)) {
        continue;
      }
      const name = (field as { name?: unknown }).name;
      if (typeof name !== "string") {
        continue;
      }
      const entry = fieldCopy[name];
      if (!entry || typeof entry === "string") {
        continue;
      }
      for (const key of ["label", "placeholder", "description"] as const) {
        if (
          typeof entry[key] === "string" &&
          typeof (field as Record<string, unknown>)[key] === "string"
        ) {
          (field as Record<string, unknown>)[key] = entry[key];
        }
      }
      const options = (field as { options?: unknown }).options;
      const optionCopy = entry.options;
      if (!optionCopy || typeof optionCopy === "string" || !Array.isArray(options)) {
        continue;
      }
      for (const option of options) {
        if (!option || typeof option !== "object" || Array.isArray(option)) {
          continue;
        }
        const optionValue = (option as { value?: unknown }).value;
        if (typeof optionValue !== "string") {
          continue;
        }
        const label = optionCopy[optionValue];
        if (typeof label === "string") {
          (option as { label?: string }).label = label;
        }
      }
    }
  });
  const legal = translated.legal;
  if (legal && typeof legal !== "string") {
    applyStringTree(next.legalConsentOptions, legal);
  }
  return next;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function unescapeHtml(value: string): string {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

export function buildBlogDocument(input: {
  htmlTitle: string;
  metaDescription: string;
  postBody: string;
}): string {
  return `<!DOCTYPE html>
<html><body>
<section data-hl-field="htmlTitle"><h1>${escapeHtml(input.htmlTitle)}</h1></section>
<section data-hl-field="metaDescription"><p>${escapeHtml(input.metaDescription)}</p></section>
<section data-hl-field="postBody">${input.postBody}</section>
</body></html>
`;
}

export function readBlogDocument(html: string): {
  htmlTitle: string;
  metaDescription: string;
  postBody: string;
} {
  const title = /data-hl-field="htmlTitle"[^>]*>\s*<h1>([\s\S]*?)<\/h1>/i.exec(html);
  const description = /data-hl-field="metaDescription"[^>]*>\s*<p>([\s\S]*?)<\/p>/i.exec(html);
  const body = /data-hl-field="postBody"[^>]*>([\s\S]*?)<\/section>/i.exec(html);
  return {
    htmlTitle: unescapeHtml(title?.[1] ?? ""),
    metaDescription: unescapeHtml(description?.[1] ?? ""),
    postBody: body?.[1] ?? "",
  };
}

function sortTree(value: HubspotStringTree): HubspotStringTree {
  const sorted: HubspotStringTree = {};
  for (const key of Object.keys(value).toSorted()) {
    const entry = value[key];
    if (entry === undefined) {
      continue;
    }
    sorted[key] = typeof entry === "string" ? entry : sortTree(entry);
  }
  return sorted;
}

export function serializeHubspotDocument(document: HubspotStringTree): string {
  return `${JSON.stringify(sortTree(document), null, 2)}\n`;
}

export function hubspotDocumentHasCopy(document: HubspotStringTree): boolean {
  return Object.keys(document).length > 0;
}

export function hashHubspotContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function readHubspotStringTree(value: unknown): HubspotStringTree {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const tree: HubspotStringTree = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") {
      tree[key] = entry;
      continue;
    }
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      tree[key] = readHubspotStringTree(entry);
    }
  }
  return tree;
}

/** Overlay approved translation keys onto the source document. Missing keys keep the source. */
export function mergeHubspotTranslations(
  source: HubspotStringTree,
  translated: Record<string, string>,
): HubspotStringTree {
  const flat = flattenHubspotDocument(source);
  for (const [key, value] of Object.entries(translated)) {
    if (key in flat) {
      flat[key] = value;
    }
  }
  return unflattenHubspotDocument(flat);
}

export function flattenHubspotDocument(document: HubspotStringTree): Record<string, string> {
  const flat: Record<string, string> = {};
  const visit = (prefix: string, value: HubspotStringTree) => {
    for (const [key, entry] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${key}` : key;
      if (typeof entry === "string") {
        flat[next] = entry;
      } else {
        visit(next, entry);
      }
    }
  };
  visit("", document);
  return flat;
}

function unflattenHubspotDocument(flat: Record<string, string>): HubspotStringTree {
  const root: HubspotStringTree = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split(".");
    let cursor = root;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index] ?? "";
      if (index === parts.length - 1) {
        cursor[part] = value;
        break;
      }
      const existing = cursor[part];
      if (!existing || typeof existing === "string") {
        cursor[part] = {};
      }
      cursor = cursor[part] as HubspotStringTree;
    }
  }
  return root;
}
