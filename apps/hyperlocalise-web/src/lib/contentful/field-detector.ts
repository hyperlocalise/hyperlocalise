import type {
  ContentfulConnectionFieldConfig,
  ContentfulContentType,
  ContentfulEntry,
  ContentfulFieldDefinition,
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

function fieldNameLooksTextual(field: ContentfulFieldDefinition) {
  const haystack = `${field.id} ${field.name}`.toLowerCase();
  return TEXTUAL_FIELD_NAME_HINTS.some((hint) => haystack.includes(hint));
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

function shouldTranslateField(input: {
  field: ContentfulFieldDefinition;
  contentTypeId: string;
  config: ContentfulConnectionFieldConfig;
}) {
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

function readLocaleValue(entry: ContentfulEntry, fieldId: string, locale: string) {
  return entry.fields[fieldId]?.[locale];
}

function existingTranslationForLocale(input: {
  entry: ContentfulEntry;
  fieldId: string;
  locale: string;
}) {
  const value = readLocaleValue(input.entry, input.fieldId, input.locale);
  const text = valueToSourceText(value);
  if (!text.trim()) {
    return null;
  }
  return { locale: input.locale, text, value };
}

export function detectContentfulTranslatableFields(input: {
  entry: ContentfulEntry;
  contentType: ContentfulContentType;
  sourceLocale: string;
  targetLocales: string[];
  fieldConfig: ContentfulConnectionFieldConfig;
  overwriteDraftLocales?: boolean;
}): ContentfulTranslatableUnit[] {
  const contentTypeId = input.contentType.sys.id;
  const units: ContentfulTranslatableUnit[] = [];

  for (const field of input.contentType.fields) {
    if (!shouldTranslateField({ field, contentTypeId, config: input.fieldConfig })) {
      continue;
    }

    const sourceValue = readLocaleValue(input.entry, field.id, input.sourceLocale);
    const sourceText = valueToSourceText(sourceValue);
    if (!sourceText.trim()) {
      continue;
    }

    const existingTranslations = input.targetLocales.flatMap((locale) => {
      const translation = existingTranslationForLocale({
        entry: input.entry,
        fieldId: field.id,
        locale,
      });
      return translation ? [translation] : [];
    });

    if (
      !input.overwriteDraftLocales &&
      existingTranslations.length === input.targetLocales.length
    ) {
      continue;
    }

    units.push({
      externalStringId: `${input.entry.sys.id}:${field.id}`,
      key: `${contentTypeId}.${field.id}`,
      fieldId: field.id,
      fieldName: field.name,
      sourceLocale: input.sourceLocale,
      sourceValue,
      sourceText,
      existingTranslations: input.overwriteDraftLocales ? [] : existingTranslations,
      contentfulValueKind: detectValueKind(sourceValue),
    });
  }

  return units;
}

export function formatTranslatedValueForContentful(input: {
  sourceValue: unknown;
  translatedText: string;
  valueKind: ContentfulTranslatableUnit["contentfulValueKind"];
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
    return replaceRichTextTextNodes(input.sourceValue, input.translatedText);
  }

  return input.translatedText;
}
