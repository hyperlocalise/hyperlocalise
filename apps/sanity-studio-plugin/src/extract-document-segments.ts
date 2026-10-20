import { createSanitySegment } from "./segment-file";
import type { SanitySegment } from "./plugin-messages";
import type { LocalizationMode } from "./localization-mode";

const SKIP_TOP_LEVEL_KEYS = new Set([
  "_id",
  "_type",
  "_rev",
  "_createdAt",
  "_updatedAt",
  "_key",
  "language",
]);

type FieldValue = unknown;

function isRecord(value: FieldValue): value is Record<string, FieldValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPortableTextBlock(
  value: FieldValue,
  customBlockTypes: string[] = [],
): value is Record<string, FieldValue> {
  if (!isRecord(value) || typeof value._type !== "string") {
    return false;
  }
  return value._type === "block" || customBlockTypes.includes(value._type);
}

function isInternationalizedEntry(value: FieldValue): value is Record<string, FieldValue> {
  return (
    isRecord(value) &&
    typeof value._type === "string" &&
    value._type.startsWith("internationalizedArray") &&
    "language" in value
  );
}

function readInternationalizedValue(
  fieldValue: FieldValue,
  locale: string,
): FieldValue | undefined {
  if (!Array.isArray(fieldValue)) {
    return undefined;
  }
  const match = fieldValue.find(
    (entry) => isInternationalizedEntry(entry) && entry.language === locale,
  );
  if (!isInternationalizedEntry(match)) {
    return undefined;
  }
  return match.value;
}

function extractPortableText(
  value: FieldValue[],
  prefix: string,
  out: Map<string, string>,
  customBlockTypes: string[],
): void {
  for (let blockIndex = 0; blockIndex < value.length; blockIndex += 1) {
    const block = value[blockIndex];
    if (!isPortableTextBlock(block, customBlockTypes)) {
      continue;
    }
    const children = block.children;
    if (!Array.isArray(children)) {
      continue;
    }
    for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
      const child = children[childIndex];
      if (!isRecord(child)) {
        continue;
      }
      const text = child.text;
      if (typeof text === "string" && text.length > 0) {
        out.set(`${prefix}.${blockIndex}.children.${childIndex}.text`, text);
      }
    }
  }
}

function walkValue(
  value: FieldValue | undefined,
  prefix: string,
  out: Map<string, string>,
  customBlockTypes: string[],
  excludeFieldNames: Set<string>,
): void {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value === "string") {
    if (value.length > 0) {
      out.set(prefix, value);
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every(isInternationalizedEntry)) {
      return;
    }
    if (value.some((entry) => isPortableTextBlock(entry, customBlockTypes))) {
      extractPortableText(value, prefix, out, customBlockTypes);
      return;
    }
    for (let index = 0; index < value.length; index += 1) {
      walkValue(value[index], `${prefix}.${index}`, out, customBlockTypes, excludeFieldNames);
    }
    return;
  }
  if (isRecord(value)) {
    if (value._type === "image" || value._type === "file" || value._type === "slug") {
      return;
    }
    if (value._ref && value._type === "reference") {
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("_") || excludeFieldNames.has(key)) {
        continue;
      }
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      walkValue(child, nextPrefix, out, customBlockTypes, excludeFieldNames);
    }
  }
}

export function extractDocumentTextMap(input: {
  document: Record<string, FieldValue>;
  i18nMode: LocalizationMode;
  sourceLocale: string;
  customBlockTypes?: string[];
  excludeFieldNames?: string[];
}): Map<string, string> {
  const out = new Map<string, string>();
  if (input.i18nMode === "unsupported") {
    return out;
  }

  const i18nMode = input.i18nMode === "field-level" ? "field" : "document";
  const customBlockTypes = input.customBlockTypes ?? [];
  const excludeFieldNames = new Set(input.excludeFieldNames ?? []);

  for (const [key, value] of Object.entries(input.document)) {
    if (SKIP_TOP_LEVEL_KEYS.has(key) || key.startsWith("_") || excludeFieldNames.has(key)) {
      continue;
    }
    if (i18nMode === "field") {
      const localeValue = readInternationalizedValue(value, input.sourceLocale);
      if (localeValue === undefined) {
        continue;
      }
      if (typeof localeValue === "string") {
        if (localeValue.length > 0) {
          out.set(key, localeValue);
        }
        continue;
      }
      walkValue(localeValue, key, out, customBlockTypes, excludeFieldNames);
      continue;
    }
    walkValue(value, key, out, customBlockTypes, excludeFieldNames);
  }
  return out;
}

export function extractDocumentSegments(input: {
  document: Record<string, FieldValue>;
  documentId: string;
  documentType: string;
  i18nMode: LocalizationMode;
  sourceLocale: string;
  customBlockTypes?: string[];
  excludeFieldNames?: string[];
}): SanitySegment[] {
  const map = extractDocumentTextMap(input);
  const segments: SanitySegment[] = [];
  for (const [fieldPath, text] of map.entries()) {
    segments.push(
      createSanitySegment({
        documentId: input.documentId,
        documentType: input.documentType,
        text,
        existingKey: `sanity.k.${fieldPath}`,
      }),
    );
  }
  return segments;
}

function readLocalizedStringField(value: FieldValue): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const first = value.find(
      (entry) => isInternationalizedEntry(entry) && typeof entry.value === "string",
    );
    if (isInternationalizedEntry(first) && typeof first.value === "string" && first.value.trim()) {
      return first.value.trim();
    }
  }
  return undefined;
}

export function readDocumentTitle(document: Record<string, FieldValue>): string | undefined {
  return readLocalizedStringField(document.title);
}

export function readDocumentName(document: Record<string, FieldValue>): string | undefined {
  return readLocalizedStringField(document.name);
}

export function documentDisplayName(
  document: Record<string, FieldValue>,
  fallback = "Untitled document",
): string {
  return readDocumentTitle(document) ?? readDocumentName(document) ?? fallback;
}
