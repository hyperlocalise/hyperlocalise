import type { HyperlocalisePluginConfig } from "./config";

export type LocalizationMode = "field-level" | "document-level" | "unsupported";

export function resolveLocalizationMode(input: {
  documentType: string;
  options: Pick<
    HyperlocalisePluginConfig,
    "documentLocalizationSchemaTypes" | "fieldLocalizationSchemaTypes"
  >;
  hasLanguageField: boolean;
  hasInternationalizedArrayField: boolean;
}): LocalizationMode {
  if (input.options.fieldLocalizationSchemaTypes.includes(input.documentType)) {
    return "field-level";
  }
  if (input.options.documentLocalizationSchemaTypes.includes(input.documentType)) {
    return "document-level";
  }
  if (input.hasLanguageField) {
    return "document-level";
  }
  if (input.hasInternationalizedArrayField) {
    return "field-level";
  }
  return "unsupported";
}
