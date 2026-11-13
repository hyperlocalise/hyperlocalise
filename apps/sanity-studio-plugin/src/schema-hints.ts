import type { Schema } from "sanity";

import { isRecord } from "./json";

type SchemaField = {
  name: string;
  type?: unknown;
};

function readFields(type: unknown): SchemaField[] {
  if (!isRecord(type) || !Array.isArray(type.fields)) {
    return [];
  }
  return type.fields.filter((field): field is SchemaField => {
    return isRecord(field) && typeof field.name === "string";
  });
}

function fieldOptions(type: unknown): Record<string, unknown> | undefined {
  if (!isRecord(type) || !isRecord(type.options)) {
    return undefined;
  }
  return type.options;
}

function isExcludedField(type: unknown): boolean {
  const options = fieldOptions(type);
  if (!options) {
    return false;
  }
  const hyperlocalise = options.hyperlocalise;
  if (isRecord(hyperlocalise) && hyperlocalise.exclude === true) {
    return true;
  }
  const tosProperties = options.tosProperties;
  return isRecord(tosProperties) && tosProperties.exclude === true;
}

export function schemaI18nHints(documentType: string, schema: Schema) {
  const type = schema.get(documentType);
  const fields = readFields(type);
  const hasLanguageField = fields.some((field) => field.name === "language");
  const hasInternationalizedArrayField = fields.some((field) => {
    const fieldType = field.type;
    if (!isRecord(fieldType)) {
      return false;
    }
    const name = typeof fieldType.name === "string" ? fieldType.name : "";
    return name.startsWith("internationalizedArray");
  });
  return { hasLanguageField, hasInternationalizedArrayField };
}

export function collectExcludedFieldNames(documentType: string, schema: Schema): string[] {
  const names = new Set<string>();

  function visit(type: unknown) {
    for (const field of readFields(type)) {
      if (isExcludedField(field.type)) {
        names.add(field.name);
      }
      visit(field.type);
    }
  }

  visit(schema.get(documentType));
  return [...names];
}
