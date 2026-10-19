import type { HyperlocalisePluginOptions } from "./plugin-options";

export type LocalizationMode = "field-level" | "document-level" | "unsupported";

export function resolveLocalizationMode(input: {
  documentType: string;
  options: HyperlocalisePluginOptions;
  hasLanguageField: boolean;
  hasInternationalizedArrayField: boolean;
}): LocalizationMode {
  if (input.options.fieldTypes?.includes(input.documentType)) {
    return "field-level";
  }
  if (input.options.documentTypes?.includes(input.documentType)) {
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
