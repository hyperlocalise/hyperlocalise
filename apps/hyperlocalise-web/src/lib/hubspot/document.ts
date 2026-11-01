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

/** JSON stored on HubSpot emails and pages. */
export type HubspotJson =
  | string
  | number
  | boolean
  | null
  | HubspotJson[]
  | { [key: string]: HubspotJson };

export function isHubspotJsonObject(value: HubspotJson): value is { [key: string]: HubspotJson } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

function isProseValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (/<[^>]+>/.test(trimmed)) {
    return true;
  }
  return /\s/.test(trimmed) && trimmed.length >= 3;
}

function isLockedKey(key: string, value: HubspotJson): boolean {
  const normalized = key.trim().toLowerCase();
  if (normalized === "value" || normalized === "defaultvalue") {
    if (typeof value === "string") {
      return !isProseValue(value);
    }
    return false;
  }
  return LOCKED_KEYS.has(normalized);
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

export function collectCopyTree(value: HubspotJson): HubspotStringTree {
  const tree: HubspotStringTree = {};
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      const key = String(index);
      if (typeof entry === "string") {
        if (isCopyString(entry)) {
          tree[key] = entry;
        }
        return;
      }
      const nested = collectCopyTree(entry);
      if (Object.keys(nested).length > 0) {
        tree[key] = nested;
      }
    });
    return tree;
  }
  if (!isHubspotJsonObject(value)) {
    return tree;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (isLockedKey(key, entry) || PREVIEW_KEYS.has(key.trim().toLowerCase())) {
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

export function applyStringTree(target: HubspotJson, tree: HubspotStringTree): void {
  if (Array.isArray(target)) {
    for (const [key, value] of Object.entries(tree)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= target.length) {
        continue;
      }
      if (typeof value === "string") {
        if (typeof target[index] === "string") {
          target[index] = value;
        }
        continue;
      }
      applyStringTree(target[index], value);
    }
    return;
  }
  if (!isHubspotJsonObject(target)) {
    return;
  }
  const record = target;
  for (const [key, value] of Object.entries(tree)) {
    if (key === "__proto__") {
      continue;
    }
    if (typeof value === "string") {
      if (typeof record[key] === "string") {
        record[key] = value;
      }
      continue;
    }
    applyStringTree(record[key], value);
  }
}

function takePreviewText(widgets: HubspotJson): { previewText: string; widgets: HubspotJson } {
  const clone = structuredClone(widgets);
  let previewText = "";
  const visit = (node: HubspotJson) => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    if (!isHubspotJsonObject(node)) {
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (
        !previewText &&
        PREVIEW_KEYS.has(key.trim().toLowerCase()) &&
        typeof value === "string" &&
        isCopyString(value)
      ) {
        previewText = value;
        delete node[key];
        continue;
      }
      visit(value);
    }
  };
  visit(clone);
  return { previewText, widgets: clone };
}

export function writePreviewText(widgets: HubspotJson, previewText: string): void {
  if (!previewText || !isHubspotJsonObject(widgets)) {
    return;
  }
  const visit = (node: HubspotJson): boolean => {
    if (Array.isArray(node)) {
      return node.some((item) => visit(item));
    }
    if (!isHubspotJsonObject(node)) {
      return false;
    }
    for (const [key, value] of Object.entries(node)) {
      if (PREVIEW_KEYS.has(key.trim().toLowerCase()) && typeof value === "string") {
        node[key] = previewText;
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

/**
 * Widget setting leaves on marketing emails. These hold layout enums, units,
 * and font names (`center`, `none`, `%`, `px`, `Arial, sans-serif`) rather
 * than rendered copy, so they stay out of the translatable document. Image
 * `alt` text is kept: it renders when images are blocked and is legitimate
 * copy. Page, blog, and form documents are unaffected.
 */
const EMAIL_SETTING_KEYS = new Set([
  "align",
  "alignment",
  "border_style",
  "corner_radius",
  "corner_radius_unit",
  "font",
  "line_type",
  "unsubscribe_link_type",
  "units",
]);

function stripEmailSettingKeys(tree: HubspotStringTree): HubspotStringTree {
  const out: HubspotStringTree = {};
  for (const [key, entry] of Object.entries(tree)) {
    if (typeof entry === "string") {
      if (!EMAIL_SETTING_KEYS.has(key.trim().toLowerCase())) {
        out[key] = entry;
      }
      continue;
    }
    const nested = stripEmailSettingKeys(entry);
    if (Object.keys(nested).length > 0) {
      out[key] = nested;
    }
  }
  return out;
}

export function buildEmailDocument(input: {
  subject: string;
  widgets: HubspotJson;
}): HubspotStringTree {
  const document: HubspotStringTree = {};
  if (isCopyString(input.subject)) {
    document.subject = input.subject;
  }
  const { previewText, widgets } = takePreviewText(input.widgets);
  if (previewText) {
    document.previewText = previewText;
  }
  const widgetCopy = stripEmailSettingKeys(collectCopyTree(widgets));
  if (Object.keys(widgetCopy).length > 0) {
    document.widgets = widgetCopy;
  }
  return document;
}

export function buildPageDocument(input: {
  htmlTitle: string;
  metaDescription: string;
  featuredImageAltText: string;
  widgets: HubspotJson;
  layoutSections: HubspotJson;
  widgetContainers?: HubspotJson;
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
  const widgetContainers = collectCopyTree(input.widgetContainers ?? {});
  if (Object.keys(widgetContainers).length > 0) {
    document.widgetContainers = widgetContainers;
  }
  return document;
}

function visibleCopy(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildBlogContentDocument(input: {
  htmlTitle: string;
  metaDescription: string;
  featuredImageAltText: string;
  postBody: string;
  postSummary: string;
  rssBody?: string;
  rssSummary: string;
  widgets: HubspotJson;
  layoutSections: HubspotJson;
  widgetContainers?: HubspotJson;
}): HubspotStringTree {
  const document = buildPageDocument(input);
  if (isCopyString(input.postBody)) {
    document.postBody = input.postBody;
  }
  const rssBody = input.rssBody ?? "";
  if (isCopyString(rssBody)) {
    const rss = visibleCopy(rssBody);
    const body = visibleCopy(input.postBody);
    if (rss && !body.includes(rss)) {
      document.rssBody = rssBody;
    }
  }
  if (isCopyString(input.postSummary)) {
    document.postSummary = input.postSummary;
  }
  if (isCopyString(input.rssSummary)) {
    document.rssSummary = input.rssSummary;
  }
  return document;
}

export function applyBlogContentDocument(
  live: {
    htmlTitle: string;
    metaDescription: string;
    featuredImageAltText: string;
    postBody: string;
    postSummary: string;
    rssBody?: string;
    rssSummary: string;
    widgets: HubspotJson;
    layoutSections: HubspotJson;
    widgetContainers?: HubspotJson;
  },
  translated: HubspotStringTree,
): {
  htmlTitle: string;
  metaDescription: string;
  featuredImageAltText: string;
  postBody: string;
  postSummary: string;
  rssBody: string;
  rssSummary: string;
  widgets: HubspotJson;
  layoutSections: HubspotJson;
  widgetContainers: HubspotJson;
} {
  const page = applyPageDocument(live, translated);
  return {
    ...page,
    postBody: typeof translated.postBody === "string" ? translated.postBody : live.postBody,
    rssBody: typeof translated.rssBody === "string" ? translated.rssBody : (live.rssBody ?? ""),
    postSummary:
      typeof translated.postSummary === "string" ? translated.postSummary : live.postSummary,
    rssSummary: typeof translated.rssSummary === "string" ? translated.rssSummary : live.rssSummary,
  };
}

export function applyPageDocument(
  live: {
    htmlTitle: string;
    metaDescription: string;
    featuredImageAltText: string;
    widgets: HubspotJson;
    layoutSections: HubspotJson;
    widgetContainers?: HubspotJson;
  },
  translated: HubspotStringTree,
): {
  htmlTitle: string;
  metaDescription: string;
  featuredImageAltText: string;
  widgets: HubspotJson;
  layoutSections: HubspotJson;
  widgetContainers: HubspotJson;
} {
  const widgets = structuredClone(live.widgets ?? {});
  const layoutSections = structuredClone(live.layoutSections ?? {});
  const widgetContainers = structuredClone(live.widgetContainers ?? {});
  if (translated.widgets && typeof translated.widgets !== "string") {
    applyStringTree(widgets, translated.widgets);
  }
  if (translated.layoutSections && typeof translated.layoutSections !== "string") {
    applyStringTree(layoutSections, translated.layoutSections);
  }
  if (translated.widgetContainers && typeof translated.widgetContainers !== "string") {
    applyStringTree(widgetContainers, translated.widgetContainers);
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
    widgetContainers,
  };
}

export function applyEmailDocument(
  widgets: HubspotJson,
  translated: HubspotStringTree,
): { subject: string; widgets: HubspotJson } {
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
  const legalConsentOptions = definition.legalConsentOptions;
  const legal = collectCopyTree(
    legalConsentOptions !== null && typeof legalConsentOptions === "object"
      ? (legalConsentOptions as HubspotJson)
      : {},
  );
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
  const consent = next.legalConsentOptions;
  if (legal && typeof legal !== "string" && consent !== null && typeof consent === "object") {
    applyStringTree(consent as HubspotJson, legal);
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

function visibleTemplateText(value: string): string {
  return value
    .replace(/\{\{[\s\S]*?\}\}/g, " ")
    .replace(/\{%[\s\S]*?%\}/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&nbsp;", " ")
    .trim();
}

export function messageTemplateHasCopy(input: { subject: string; body: string }): boolean {
  return isCopyString(input.subject) || visibleTemplateText(input.body).length > 0;
}

export function buildMessageTemplateDocument(input: { subject: string; body: string }): string {
  return `<!DOCTYPE html>
<html><body>
<section data-hl-field="subject"><p>${escapeHtml(input.subject)}</p></section>
<section data-hl-field="body">${input.body}</section>
</body></html>
`;
}

const EMAIL_FIELD_END = "<!--/hl-field-->";
const EMAIL_HTML_VALUE = /<[A-Za-z]+\b[^>]*>/;
const EMAIL_HTML_CLOSE = /<\/[A-Za-z]+>/;

function isEmailHtmlValue(value: string): boolean {
  return EMAIL_HTML_VALUE.test(value) || EMAIL_HTML_CLOSE.test(value);
}

function escapeEmailFieldAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function unescapeEmailFieldAttr(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

export type EmailHtmlKind = "text" | "html";

/** Section kinds for a tree, used to keep locale envelopes structurally identical. */
export function emailHtmlKinds(tree: HubspotStringTree): Record<string, EmailHtmlKind> {
  const flat = flattenHubspotDocument(tree);
  const kinds: Record<string, EmailHtmlKind> = {};
  for (const [key, value] of Object.entries(flat)) {
    kinds[key] = isEmailHtmlValue(value) ? "html" : "text";
  }
  return kinds;
}

export function buildEmailHtmlDocument(
  tree: HubspotStringTree,
  options?: { styleSettings?: HubspotJson; kinds?: Record<string, EmailHtmlKind> },
): string {
  const flat = flattenHubspotDocument(tree);
  const sections = Object.keys(flat)
    .toSorted()
    .map((key) => {
      const value = flat[key] ?? "";
      const field = escapeEmailFieldAttr(key);
      const kind = options?.kinds?.[key] ?? (isEmailHtmlValue(value) ? "html" : "text");
      if (kind === "html") {
        return `<section data-hl-field="${field}" data-hl-kind="html">${value}${EMAIL_FIELD_END}</section>`;
      }
      return `<section data-hl-field="${field}" data-hl-kind="text"><p>${escapeHtml(value)}</p>${EMAIL_FIELD_END}</section>`;
    });
  const styleSettings = options?.styleSettings;
  const meta =
    styleSettings !== undefined &&
    isHubspotJsonObject(styleSettings) &&
    Object.keys(styleSettings).length > 0
      ? `<script type="application/json" data-hl-meta="styleSettings">${JSON.stringify(styleSettings)}</script>\n`
      : "";
  return `<!DOCTYPE html>
<html><body>
${meta}${sections.join("\n")}
</body></html>
`;
}

export function extractEmailStyleSettings(html: string): HubspotJson | undefined {
  const raw = /<script\b[^>]*data-hl-meta="styleSettings"[^>]*>([\s\S]*?)<\/script>/i.exec(
    html,
  )?.[1];
  if (!raw) {
    return undefined;
  }
  try {
    const parsed: HubspotJson = JSON.parse(raw);
    return isHubspotJsonObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function readEmailHtmlDocument(html: string): HubspotStringTree {
  const flat: Record<string, string> = {};
  const sectionPattern = /<section\b([^>]*)>([\s\S]*?)<!--\/hl-field-->\s*<\/section>/gi;
  for (const match of html.matchAll(sectionPattern)) {
    const attrs = match[1] ?? "";
    const content = match[2] ?? "";
    const field = /data-hl-field="([^"]*)"/i.exec(attrs)?.[1];
    const kind = /data-hl-kind="(text|html)"/i.exec(attrs)?.[1];
    if (!field || !kind) {
      continue;
    }
    const key = unescapeEmailFieldAttr(field);
    if (!key) {
      continue;
    }
    if (kind === "text") {
      const text = /<p>([\s\S]*?)<\/p>/i.exec(content)?.[1] ?? "";
      flat[key] = unescapeHtml(text);
    } else {
      flat[key] = content;
    }
  }
  return unflattenHubspotDocument(flat);
}

export function readMessageTemplateDocument(html: string): {
  subject: string;
  body: string;
  foundSubject: boolean;
  foundBody: boolean;
} {
  const subject = /data-hl-field="subject"[^>]*>\s*<p>([\s\S]*?)<\/p>/i.exec(html);
  const body = /data-hl-field="body"[^>]*>([\s\S]*?)<\/section>/i.exec(html);
  return {
    subject: unescapeHtml(subject?.[1] ?? ""),
    body: body?.[1] ?? "",
    foundSubject: Boolean(subject),
    foundBody: Boolean(body),
  };
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

export function readHubspotStringTree(value: HubspotJson): HubspotStringTree {
  if (!isHubspotJsonObject(value)) {
    return {};
  }
  const tree: HubspotStringTree = {};
  for (const [key, entry] of Object.entries(value)) {
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

export function unflattenHubspotDocument(flat: Record<string, string>): HubspotStringTree {
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
