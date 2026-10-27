import { z } from "zod";

// Caps are checked before each item is parsed, so a huge list cannot exhaust memory.
const MAX_CONFIG_ITEMS = 2000;

const languageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  enabled: z.boolean().optional(),
});

const boundedStrings = (minimum: number) => z.array(z.string()).min(minimum).max(MAX_CONFIG_ITEMS);

const pluginConfigSchema = z
  .object({
    supportedLanguages: z.array(languageSchema).min(1).max(MAX_CONFIG_ITEMS),
    documentLocalizationSchemaTypes: boundedStrings(0).default([]),
    fieldLocalizationSchemaTypes: boundedStrings(0).default([]),
    customBlockTypes: boundedStrings(0).optional(),
  })
  .superRefine((value, context) => {
    const documentTypes = new Set(value.documentLocalizationSchemaTypes);
    const overlap = value.fieldLocalizationSchemaTypes.filter((schemaType) =>
      documentTypes.has(schemaType),
    );
    if (overlap.length > 0) {
      context.addIssue({
        code: "custom",
        message: `A schema type cannot be in both documentLocalizationSchemaTypes and fieldLocalizationSchemaTypes: ${overlap.join(", ")}`,
      });
    }
  });

const bulkConfigSchema = z.object({
  supportedLanguages: z.array(languageSchema).min(1).max(MAX_CONFIG_ITEMS),
  schemaTypes: boundedStrings(1),
  customBlockTypes: boundedStrings(0).optional(),
});

export type HyperlocaliseLanguage = z.infer<typeof languageSchema>;
export type HyperlocalisePluginConfig = z.infer<typeof pluginConfigSchema>;
export type HyperlocaliseBulkConfig = z.infer<typeof bulkConfigSchema>;

export type ParsedConfig<T> = { ok: true; data: T } | { ok: false; error: string };

export function parsePluginConfig(value: unknown): ParsedConfig<HyperlocalisePluginConfig> {
  const parsed = pluginConfigSchema.safeParse(value);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }
  return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join(" ") };
}

export function parseBulkConfig(value: unknown): ParsedConfig<HyperlocaliseBulkConfig> {
  const parsed = bulkConfigSchema.safeParse(value);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }
  return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join(" ") };
}

export function enabledLanguages(languages: HyperlocaliseLanguage[]): HyperlocaliseLanguage[] {
  return languages.filter((language) => language.enabled !== false);
}
