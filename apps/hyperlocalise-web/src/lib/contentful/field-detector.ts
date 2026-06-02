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
    return value.filter((item): item is string => typeof item === "string").join(", ");
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

function replaceRichTextTextNodes(value: unknown, translatedText: string): unknown {
  let wroteTranslation = false;

  function visit(node: unknown): unknown {
    if (Array.isArray(node)) {
      return node.map(visit);
    }

    if (!isRecord(node)) {
      return node;
    }

    if (node.nodeType === "text" && typeof node.value === "string") {
      if (!wroteTranslation) {
        wroteTranslation = true;
        return { ...node, value: translatedText };
      }
      return { ...node, value: "" };
    }

    return Object.fromEntries(Object.entries(node).map(([key, nested]) => [key, visit(nested)]));
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
      existingTranslations,
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
    return input.translatedText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (input.valueKind === "string") {
    return input.translatedText;
  }

  if (input.valueKind === "rich_text" && isRecord(input.sourceValue)) {
    return replaceRichTextTextNodes(input.sourceValue, input.translatedText);
  }

  return input.translatedText;
}
