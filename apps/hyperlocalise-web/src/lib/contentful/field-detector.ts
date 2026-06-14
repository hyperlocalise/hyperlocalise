import { resolveContentfulLocaleKey } from "./contentful-locale";
import type {
  ContentfulAssetLink,
  ContentfulConnectionFieldConfig,
  ContentfulContentType,
  ContentfulEntry,
  ContentfulFieldDefinition,
  ContentfulTranslatableFieldUnit,
  ContentfulTranslatableUnit,
} from "./types";

const TEXTUAL_FIELD_TYPES = new Set(["Symbol", "Text", "RichText"]);
const TEXTUAL_FIELD_NAME_HINTS = [
  "title",
  "body",
  "description",
  "summary",
  "seo",
  "meta",
  "tag",
  "cta",
  "label",
  "headline",
  "subhead",
  "copy",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTextArrayField(field: ContentfulFieldDefinition) {
  return field.type === "Array" && field.items?.type === "Symbol";
}

function isAssetLinkField(field: ContentfulFieldDefinition) {
  return field.type === "Link" && field.linkType === "Asset";
}

function readAssetLink(value: unknown): ContentfulAssetLink | null {
  if (!isRecord(value)) {
    return null;
  }
  const sys = value.sys;
  if (
    isRecord(sys) &&
    sys.type === "Link" &&
    sys.linkType === "Asset" &&
    typeof sys.id === "string"
  ) {
    return value as ContentfulAssetLink;
  }
  return null;
}

export function collectRichTextEmbeddedAssetIds(value: unknown): string[] {
  const assetIds: string[] = [];

  function visit(node: unknown) {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    if (node.nodeType === "embedded-asset-block" || node.nodeType === "asset-hyperlink") {
      const target = isRecord(node.data) ? node.data.target : null;
      const assetLink = readAssetLink(target);
      if (assetLink) {
        assetIds.push(assetLink.sys.id);
      }
    }

    if (Array.isArray(node.content)) {
      visit(node.content);
    }
  }

  visit(value);
  return [...new Set(assetIds)];
}

export function replaceRichTextEmbeddedAssetIds(
  value: unknown,
  assetIdBySourceId: ReadonlyMap<string, string>,
): unknown {
  function visit(node: unknown): unknown {
    if (Array.isArray(node)) {
      return node.map(visit);
    }

    if (!isRecord(node)) {
      return node;
    }

    if (node.nodeType === "embedded-asset-block" || node.nodeType === "asset-hyperlink") {
      const target = isRecord(node.data) ? node.data.target : null;
      const assetLink = readAssetLink(target);
      if (assetLink) {
        const localizedAssetId = assetIdBySourceId.get(assetLink.sys.id);
        if (localizedAssetId) {
          return {
            ...node,
            data: {
              ...(isRecord(node.data) ? node.data : {}),
              target: {
                sys: {
                  type: "Link",
                  linkType: "Asset",
                  id: localizedAssetId,
                },
              },
            },
          };
        }
      }
    }

    if (Array.isArray(node.content)) {
      return { ...node, content: visit(node.content) };
    }

    return node;
  }

  return visit(value);
}

function shouldTranslateImageField(input: {
  field: ContentfulFieldDefinition;
  contentTypeId: string;
  config: ContentfulConnectionFieldConfig;
}) {
  if (input.field.localized !== true) {
    return false;
  }

  if (!isAssetLinkField(input.field)) {
    return false;
  }

  const configuredFields = input.config.fieldsByContentType?.[input.contentTypeId];
  if (configuredFields && configuredFields.length > 0) {
    return configuredFields.includes(input.field.id);
  }

  if (input.config.fieldMode === "configured") {
    return false;
  }

  return true;
}

function collectRichTextTextValues(value: unknown): string[] {
  const values: string[] = [];

  function visit(node: unknown) {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    if (node.nodeType === "text" && typeof node.value === "string") {
      values.push(node.value);
      return;
    }

    if (Array.isArray(node.content)) {
      visit(node.content);
    }
  }

  visit(value);
  return values;
}

function stringValuesToSourceText(values: string[]) {
  return values.length > 0 ? JSON.stringify(values) : "";
}

function fieldNameLooksTextual(field: ContentfulFieldDefinition) {
  const haystack = `${field.id} ${field.name}`.toLowerCase();
  return TEXTUAL_FIELD_NAME_HINTS.some((hint) => haystack.includes(hint));
}

function shouldTranslateTextField(input: {
  field: ContentfulFieldDefinition;
  contentTypeId: string;
  config: ContentfulConnectionFieldConfig;
}) {
  if (input.field.localized !== true) {
    return false;
  }

  const configuredFields = input.config.fieldsByContentType?.[input.contentTypeId];
  if (configuredFields && configuredFields.length > 0) {
    return configuredFields.includes(input.field.id);
  }

  if (input.config.fieldMode === "configured") {
    return false;
  }

  return (
    TEXTUAL_FIELD_TYPES.has(input.field.type) ||
    isTextArrayField(input.field) ||
    fieldNameLooksTextual(input.field)
  );
}

function valueToSourceText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return stringValuesToSourceText(
      value.filter((item): item is string => typeof item === "string"),
    );
  }
  if (isRecord(value) && value.nodeType === "document") {
    return stringValuesToSourceText(collectRichTextTextValues(value));
  }
  if (isRecord(value)) {
    return JSON.stringify(value);
  }
  return "";
}

function detectValueKind(value: unknown): ContentfulTranslatableUnit["contentfulValueKind"] {
  if (typeof value === "string") {
    return "string";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (isRecord(value) && value.nodeType === "document") {
    return "rich_text";
  }
  return "json";
}

function parseTranslatedStringArray(value: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function fallbackTranslatedSegments(value: string): string[] {
  const paragraphSegments = value
    .split(/\r?\n\s*\r?\n/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (paragraphSegments.length > 1) {
    return paragraphSegments;
  }

  const lineSegments = value
    .split(/\r?\n/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return lineSegments.length > 1 ? lineSegments : [value.trim()].filter(Boolean);
}

function replaceRichTextTextNodes(value: unknown, translatedText: string): unknown {
  const translatedSegments =
    parseTranslatedStringArray(translatedText) ?? fallbackTranslatedSegments(translatedText);
  const textNodeCount = collectRichTextTextValues(value).length;
  let textNodeIndex = 0;

  function visit(node: unknown): unknown {
    if (Array.isArray(node)) {
      return node.map(visit);
    }

    if (!isRecord(node)) {
      return node;
    }

    if (node.nodeType === "text" && typeof node.value === "string") {
      const translatedSegment = translatedSegments[textNodeIndex];
      const isLastTextNode = textNodeIndex === textNodeCount - 1;
      const remainingSegments = translatedSegments.slice(textNodeIndex);
      textNodeIndex += 1;

      if (isLastTextNode && remainingSegments.length > 1) {
        return { ...node, value: remainingSegments.join("\n\n") };
      }
      return { ...node, value: translatedSegment ?? node.value };
    }

    if (Array.isArray(node.content)) {
      return { ...node, content: visit(node.content) };
    }
    return node;
  }

  return visit(value);
}

function listFieldLocaleKeys(entry: ContentfulEntry, fieldId: string) {
  return Object.keys(entry.fields[fieldId] ?? {});
}

function resolveFieldLocaleKey(input: {
  preferredLocale: string;
  entry: ContentfulEntry;
  fieldId: string;
  defaultLocale?: string | null;
}) {
  return resolveContentfulLocaleKey(
    input.preferredLocale,
    listFieldLocaleKeys(input.entry, input.fieldId),
    {
      defaultLocale: input.defaultLocale,
    },
  );
}

function readLocaleValue(input: {
  entry: ContentfulEntry;
  fieldId: string;
  preferredLocale: string;
  defaultLocale?: string | null;
}) {
  const resolvedLocale = resolveFieldLocaleKey(input);
  if (!resolvedLocale) {
    return undefined;
  }
  return input.entry.fields[input.fieldId]?.[resolvedLocale];
}

function existingTranslationForLocale(input: {
  entry: ContentfulEntry;
  fieldId: string;
  locale: string;
  defaultLocale?: string | null;
}) {
  const resolvedLocale =
    resolveFieldLocaleKey({
      preferredLocale: input.locale,
      entry: input.entry,
      fieldId: input.fieldId,
      defaultLocale: input.defaultLocale,
    }) ?? input.locale;
  const value = input.entry.fields[input.fieldId]?.[resolvedLocale];
  const text = valueToSourceText(value);
  if (!text.trim()) {
    return null;
  }
  return { locale: resolvedLocale, text, value };
}

function existingImageLocalesForField(input: {
  entry: ContentfulEntry;
  fieldId: string;
  targetLocales: string[];
  defaultLocale?: string | null;
}) {
  return input.targetLocales.flatMap((locale) => {
    const resolvedLocale = resolveFieldLocaleKey({
      preferredLocale: locale,
      entry: input.entry,
      fieldId: input.fieldId,
      defaultLocale: input.defaultLocale,
    });
    if (!resolvedLocale) {
      return [];
    }
    const value = input.entry.fields[input.fieldId]?.[resolvedLocale];
    return readAssetLink(value) !== null ? [resolvedLocale] : [];
  });
}

export function detectContentfulTranslatableFields(input: {
  entry: ContentfulEntry;
  contentType: ContentfulContentType;
  sourceLocale: string;
  targetLocales: string[];
  fieldConfig: ContentfulConnectionFieldConfig;
  overwriteDraftLocales?: boolean;
  defaultLocale?: string | null;
}): ContentfulTranslatableFieldUnit[] {
  const contentTypeId = input.contentType.sys.id;
  const units: ContentfulTranslatableFieldUnit[] = [];

  for (const field of input.contentType.fields) {
    if (shouldTranslateImageField({ field, contentTypeId, config: input.fieldConfig })) {
      const resolvedSourceLocale =
        resolveFieldLocaleKey({
          preferredLocale: input.sourceLocale,
          entry: input.entry,
          fieldId: field.id,
          defaultLocale: input.defaultLocale,
        }) ?? input.sourceLocale;
      const sourceValue = readLocaleValue({
        entry: input.entry,
        fieldId: field.id,
        preferredLocale: input.sourceLocale,
        defaultLocale: input.defaultLocale,
      });
      const assetLink = readAssetLink(sourceValue);
      if (!assetLink) {
        continue;
      }

      const existingLocales = input.overwriteDraftLocales
        ? []
        : existingImageLocalesForField({
            entry: input.entry,
            fieldId: field.id,
            targetLocales: input.targetLocales,
            defaultLocale: input.defaultLocale,
          });

      if (!input.overwriteDraftLocales && existingLocales.length === input.targetLocales.length) {
        continue;
      }

      units.push({
        kind: "image",
        externalStringId: `${input.entry.sys.id}:${field.id}`,
        key: `${contentTypeId}.${field.id}`,
        fieldId: field.id,
        fieldName: field.name,
        sourceLocale: resolvedSourceLocale,
        sourceValue,
        assetId: assetLink.sys.id,
        existingLocales,
      });
      continue;
    }

    if (!shouldTranslateTextField({ field, contentTypeId, config: input.fieldConfig })) {
      continue;
    }

    const resolvedSourceLocale =
      resolveFieldLocaleKey({
        preferredLocale: input.sourceLocale,
        entry: input.entry,
        fieldId: field.id,
        defaultLocale: input.defaultLocale,
      }) ?? input.sourceLocale;
    const sourceValue = readLocaleValue({
      entry: input.entry,
      fieldId: field.id,
      preferredLocale: input.sourceLocale,
      defaultLocale: input.defaultLocale,
    });
    const sourceText = valueToSourceText(sourceValue);
    if (!sourceText.trim()) {
      continue;
    }

    const existingTranslations = input.targetLocales.flatMap((locale) => {
      const translation = existingTranslationForLocale({
        entry: input.entry,
        fieldId: field.id,
        locale,
        defaultLocale: input.defaultLocale,
      });
      return translation ? [translation] : [];
    });

    if (
      !input.overwriteDraftLocales &&
      existingTranslations.length === input.targetLocales.length
    ) {
      continue;
    }

    const embeddedAssetIds =
      detectValueKind(sourceValue) === "rich_text"
        ? collectRichTextEmbeddedAssetIds(sourceValue)
        : [];

    units.push({
      kind: "text",
      externalStringId: `${input.entry.sys.id}:${field.id}`,
      key: `${contentTypeId}.${field.id}`,
      fieldId: field.id,
      fieldName: field.name,
      sourceLocale: resolvedSourceLocale,
      sourceValue,
      sourceText,
      existingTranslations: input.overwriteDraftLocales ? [] : existingTranslations,
      contentfulValueKind: detectValueKind(sourceValue),
      embeddedAssetIds: embeddedAssetIds.length > 0 ? embeddedAssetIds : undefined,
    });
  }

  return units;
}

export function formatTranslatedValueForContentful(input: {
  sourceValue: unknown;
  translatedText: string;
  valueKind: ContentfulTranslatableUnit["contentfulValueKind"];
  localizedAssetIdsBySourceId?: ReadonlyMap<string, string>;
}) {
  if (input.valueKind === "array") {
    return (
      parseTranslatedStringArray(input.translatedText) ??
      fallbackTranslatedSegments(input.translatedText)
    );
  }

  if (input.valueKind === "string") {
    return input.translatedText;
  }

  if (input.valueKind === "rich_text" && isRecord(input.sourceValue)) {
    const withText = replaceRichTextTextNodes(input.sourceValue, input.translatedText);
    if (input.localizedAssetIdsBySourceId && input.localizedAssetIdsBySourceId.size > 0) {
      return replaceRichTextEmbeddedAssetIds(withText, input.localizedAssetIdsBySourceId);
    }
    return withText;
  }

  return input.translatedText;
}
