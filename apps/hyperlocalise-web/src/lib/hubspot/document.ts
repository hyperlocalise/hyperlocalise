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

import type {
  HubspotFormDefinition,
  HubspotFormDependent,
  HubspotFormField,
  HubspotFormFieldGroup,
  HubspotFormLegalConsent,
  HubspotVisualFormElement,
  HubspotVisualFormLayoutNode,
} from "./form-definition";

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

/** True when RSS visible text is the same as the article, not a shorter excerpt. */
export function blogRssBodyDuplicatesPostBody(postBody: string, rssBody: string): boolean {
  const rss = visibleCopy(rssBody);
  return Boolean(rss) && rss === visibleCopy(postBody);
}

/** True when RSS has its own copy and is not an exact duplicate of the article. */
export function blogRssBodyIsDistinctCopy(postBody: string, rssBody: string): boolean {
  const rss = visibleCopy(rssBody);
  return Boolean(rss) && rss !== visibleCopy(postBody);
}

export function buildBlogContentDocument(input: {
  name?: string;
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
  if (input.name && isCopyString(input.name)) {
    document.name = input.name;
  }
  if (isCopyString(input.postBody)) {
    document.postBody = input.postBody;
  }
  const rssBody = input.rssBody ?? "";
  if (isCopyString(rssBody) && blogRssBodyIsDistinctCopy(input.postBody, rssBody)) {
    document.rssBody = rssBody;
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
  name: string;
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
  const translatedName = typeof translated.name === "string" ? translated.name.trim() : "";
  const postBody = typeof translated.postBody === "string" ? translated.postBody : live.postBody;
  return {
    name: translatedName,
    ...page,
    postBody,
    rssBody: resolveAppliedBlogRssBody(live, translated, postBody),
    postSummary:
      typeof translated.postSummary === "string" ? translated.postSummary : live.postSummary,
    rssSummary: typeof translated.rssSummary === "string" ? translated.rssSummary : live.rssSummary,
  };
}

/** When import omitted rssBody because it matched the article, push the translated body. */
function resolveAppliedBlogRssBody(
  live: { postBody: string; rssBody?: string },
  translated: HubspotStringTree,
  translatedPostBody: string,
): string {
  if (typeof translated.rssBody === "string") {
    return translated.rssBody;
  }
  const liveRss = live.rssBody ?? "";
  if (blogRssBodyDuplicatesPostBody(live.postBody, liveRss)) {
    return translatedPostBody;
  }
  return liveRss;
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

const FORM_FIELD_LABEL_KEYS = ["label", "placeholder", "description"] as const;
const FORM_FIELD_BODY_KEYS = ["defaultValue", "richText", "html", "content", "text"] as const;
const FORM_LEGAL_COPY_KEYS = [
  "privacyText",
  "communicationConsentText",
  "consentToProcessText",
  "legitimateInterestText",
] as const;

function isFormSubmitField(field: HubspotFormField): boolean {
  const name = field.name?.trim().toLowerCase() ?? "";
  const fieldType = field.fieldType?.trim().toLowerCase() ?? "";
  return name === "submit" || fieldType === "submit";
}

function formFieldKey(
  field: HubspotFormField,
  groupIndex: number,
  fieldIndex: number,
): string | null {
  if (field.name?.trim()) {
    return field.name.trim();
  }
  if (isFormSubmitField(field)) {
    return null;
  }
  return `__g${groupIndex}_f${fieldIndex}`;
}

function formFieldCopy(field: HubspotFormField): HubspotStringTree {
  const entry: HubspotStringTree = {};
  for (const key of FORM_FIELD_LABEL_KEYS) {
    const value = field[key];
    if (typeof value === "string" && isCopyString(value)) {
      entry[key] = value;
    }
  }
  for (const key of FORM_FIELD_BODY_KEYS) {
    const value = field[key];
    if (typeof value === "string" && isCopyString(value) && isProseValue(value)) {
      entry[key] = value;
    }
  }
  if (field.options) {
    const options: HubspotStringTree = {};
    for (const option of field.options) {
      if (option.value.trim() && isCopyString(option.label)) {
        options[option.value] = option.label;
      }
    }
    if (Object.keys(options).length > 0) {
      entry.options = options;
    }
  }
  return entry;
}

function collectFormFields(
  field: HubspotFormField,
  fields: HubspotStringTree,
  groupIndex: number,
  fieldIndex: number,
): void {
  const key = formFieldKey(field, groupIndex, fieldIndex);
  if (key) {
    const entry = formFieldCopy(field);
    if (Object.keys(entry).length > 0) {
      fields[key] = entry;
    }
  }
  field.dependentFields?.forEach((dependent: HubspotFormDependent, dependentIndex: number) => {
    if (dependent.dependentField) {
      collectFormFields(
        dependent.dependentField,
        fields,
        groupIndex,
        fieldIndex * 1000 + dependentIndex + 1,
      );
    }
  });
}

function applyFormFieldCopy(
  field: HubspotFormField,
  fieldCopy: HubspotStringTree,
  groupIndex: number,
  fieldIndex: number,
): void {
  const key = formFieldKey(field, groupIndex, fieldIndex);
  if (key) {
    const entry = fieldCopy[key];
    if (entry && typeof entry !== "string") {
      for (const copyKey of [...FORM_FIELD_LABEL_KEYS, ...FORM_FIELD_BODY_KEYS]) {
        if (typeof entry[copyKey] === "string" && typeof field[copyKey] === "string") {
          field[copyKey] = entry[copyKey];
        }
      }
      const optionCopy = entry.options;
      if (optionCopy && typeof optionCopy !== "string" && field.options) {
        for (const option of field.options) {
          const label = optionCopy[option.value];
          if (typeof label === "string") {
            option.label = label;
          }
        }
      }
    }
  }
  field.dependentFields?.forEach((dependent: HubspotFormDependent, dependentIndex: number) => {
    if (dependent.dependentField) {
      applyFormFieldCopy(
        dependent.dependentField,
        fieldCopy,
        groupIndex,
        fieldIndex * 1000 + dependentIndex + 1,
      );
    }
  });
}

const VISUAL_ELEMENT_COPY_KEYS = ["label", "placeholder", "description", "text", "html"] as const;

function visualElementCopy(element: HubspotVisualFormElement): HubspotStringTree {
  const entry: HubspotStringTree = {};
  for (const key of VISUAL_ELEMENT_COPY_KEYS) {
    const value = element[key];
    if (typeof value === "string" && isCopyString(value)) {
      entry[key] = value;
    }
  }
  return entry;
}

function visualPropertyName(element: HubspotVisualFormElement): string | null {
  const name = element.propertyReference?.name?.trim();
  return name || null;
}

function collectLayoutNodeIds(
  nodes: HubspotVisualFormLayoutNode[] | undefined,
  into: Set<string>,
): void {
  if (!nodes) {
    return;
  }
  for (const node of nodes) {
    if (node.id !== undefined && String(node.id).trim()) {
      into.add(String(node.id));
    }
    collectLayoutNodeIds(node.nodes, into);
  }
}

function postSubmitElementIds(definition: HubspotFormDefinition): Set<string> {
  const ids = new Set<string>();
  for (const node of definition.layout?.nodes ?? []) {
    if (node.type === "postSubmitStep") {
      collectLayoutNodeIds([node], ids);
    }
  }
  return ids;
}

function collectVisualFormDocument(definition: HubspotFormDefinition): HubspotStringTree {
  const elementsDefinition = definition.elementsDefinition;
  if (!elementsDefinition) {
    return {};
  }
  const postSubmitIds = postSubmitElementIds(definition);
  const document: HubspotStringTree = {};
  const fields: HubspotStringTree = {};
  const elements: HubspotStringTree = {};
  for (const [id, element] of Object.entries(elementsDefinition)) {
    const type = element.type.trim();
    const copy = visualElementCopy(element);
    if (type === "submitButton") {
      if (typeof copy.text === "string" && typeof document.submitText !== "string") {
        document.submitText = copy.text;
      }
      continue;
    }
    if (type === "richText" && postSubmitIds.has(id) && typeof copy.html === "string") {
      if (typeof document.thankYou !== "string") {
        document.thankYou = copy.html;
      }
      continue;
    }
    const propertyName = visualPropertyName(element);
    if (propertyName) {
      const fieldCopy: HubspotStringTree = {};
      for (const key of FORM_FIELD_LABEL_KEYS) {
        if (typeof copy[key] === "string") {
          fieldCopy[key] = copy[key];
        }
      }
      if (Object.keys(fieldCopy).length > 0) {
        fields[propertyName] = fieldCopy;
      }
      continue;
    }
    if (Object.keys(copy).length > 0) {
      elements[id] = copy;
    }
  }
  if (Object.keys(fields).length > 0) {
    document.fields = fields;
  }
  if (Object.keys(elements).length > 0) {
    document.elements = elements;
  }
  return document;
}

function applyVisualFormDocument(
  definition: HubspotFormDefinition,
  translated: HubspotStringTree,
): void {
  const elementsDefinition = definition.elementsDefinition;
  if (!elementsDefinition) {
    return;
  }
  const postSubmitIds = postSubmitElementIds(definition);
  const fieldCopy = translated.fields;
  const elementCopy = translated.elements;
  for (const [id, element] of Object.entries(elementsDefinition)) {
    const type = element.type.trim();
    if (type === "submitButton" && typeof translated.submitText === "string") {
      element.text = translated.submitText;
      continue;
    }
    if (type === "richText" && postSubmitIds.has(id) && typeof translated.thankYou === "string") {
      element.html = translated.thankYou;
      continue;
    }
    const propertyName = visualPropertyName(element);
    const fromField =
      propertyName && fieldCopy && typeof fieldCopy !== "string"
        ? fieldCopy[propertyName]
        : undefined;
    const fromElement =
      elementCopy && typeof elementCopy !== "string" ? elementCopy[id] : undefined;
    const entry = fromField && typeof fromField !== "string" ? fromField : fromElement;
    if (!entry || typeof entry === "string") {
      continue;
    }
    for (const key of VISUAL_ELEMENT_COPY_KEYS) {
      if (typeof entry[key] === "string" && typeof element[key] === "string") {
        element[key] = entry[key];
      }
    }
  }
}

function groupCopyTree(group: HubspotFormFieldGroup): HubspotStringTree {
  if (typeof group.richText === "string" && isCopyString(group.richText)) {
    return { richText: group.richText };
  }
  return {};
}

function legalCopyTree(legal: HubspotFormLegalConsent | undefined): HubspotStringTree {
  if (!legal) {
    return {};
  }
  const tree: HubspotStringTree = {};
  for (const key of FORM_LEGAL_COPY_KEYS) {
    const value = legal[key];
    if (typeof value === "string" && isCopyString(value)) {
      tree[key] = value;
    }
  }
  return tree;
}

function applyLegalCopy(legal: HubspotFormLegalConsent, translated: HubspotStringTree): void {
  for (const key of FORM_LEGAL_COPY_KEYS) {
    const value = translated[key];
    if (typeof value === "string") {
      legal[key] = value;
    }
  }
}

export function buildFormDocument(definition: HubspotFormDefinition): HubspotStringTree {
  const document: HubspotStringTree = {};
  const visual = collectVisualFormDocument(definition);
  if (typeof visual.submitText === "string") {
    document.submitText = visual.submitText;
  }
  const submit = definition.displayOptions?.submitButtonText;
  if (typeof submit === "string" && isCopyString(submit)) {
    document.submitText = submit;
  }

  const action = definition.configuration?.postSubmitAction;
  if (
    action &&
    typeof action.value === "string" &&
    isCopyString(action.value) &&
    action.type !== "redirect_url" &&
    !URL_VALUE.test(action.value.trim())
  ) {
    document.thankYou = action.value;
  } else if (typeof visual.thankYou === "string") {
    document.thankYou = visual.thankYou;
  }

  const fields: HubspotStringTree = {};
  const groups: HubspotStringTree = {};
  definition.fieldGroups?.forEach((group: HubspotFormFieldGroup, index: number) => {
    const groupCopy = groupCopyTree(group);
    if (Object.keys(groupCopy).length > 0) {
      groups[String(index)] = groupCopy;
    }
    group.fields?.forEach((field: HubspotFormField, fieldIndex: number) => {
      if (isFormSubmitField(field)) {
        const submitLabel = field.label;
        if (
          typeof submitLabel === "string" &&
          isCopyString(submitLabel) &&
          typeof document.submitText !== "string"
        ) {
          document.submitText = submitLabel;
        }
      }
      collectFormFields(field, fields, index, fieldIndex);
    });
  });
  if (Object.keys(fields).length > 0) {
    document.fields = fields;
  }
  if (Object.keys(groups).length > 0) {
    document.groups = groups;
  }
  const legal = legalCopyTree(definition.legalConsentOptions);
  if (Object.keys(legal).length > 0) {
    document.legal = legal;
  }
  if (visual.fields && typeof visual.fields !== "string") {
    document.fields = {
      ...(typeof document.fields === "object" && document.fields ? document.fields : {}),
      ...visual.fields,
    };
  }
  if (visual.elements && typeof visual.elements !== "string") {
    document.elements = visual.elements;
  }
  return document;
}

export function applyFormDocument(
  definition: HubspotFormDefinition,
  translated: HubspotStringTree,
): HubspotFormDefinition {
  const next = structuredClone(definition);
  applyVisualFormDocument(next, translated);
  if (typeof translated.submitText === "string" && next.displayOptions) {
    next.displayOptions.submitButtonText = translated.submitText;
  }
  if (
    typeof translated.thankYou === "string" &&
    next.configuration?.postSubmitAction?.type === "thank_you"
  ) {
    next.configuration.postSubmitAction.value = translated.thankYou;
  }
  const fieldCopy = translated.fields;
  const groupCopy = translated.groups;
  next.fieldGroups?.forEach((group: HubspotFormFieldGroup, index: number) => {
    const groupEntry =
      groupCopy && typeof groupCopy !== "string" ? groupCopy[String(index)] : undefined;
    if (groupEntry && typeof groupEntry !== "string" && typeof groupEntry.richText === "string") {
      group.richText = groupEntry.richText;
    }
    if (!fieldCopy || typeof fieldCopy === "string" || !group.fields) {
      return;
    }
    group.fields.forEach((field: HubspotFormField, fieldIndex: number) => {
      if (isFormSubmitField(field) && typeof translated.submitText === "string" && field.label) {
        field.label = translated.submitText;
      }
      applyFormFieldCopy(field, fieldCopy, index, fieldIndex);
    });
  });
  if (translated.legal && typeof translated.legal !== "string" && next.legalConsentOptions) {
    applyLegalCopy(next.legalConsentOptions, translated.legal);
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
