import { z } from "zod";

const languageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  enabled: z.boolean().optional(),
});

const pluginConfigSchema = z
  .object({
    supportedLanguages: z.array(languageSchema).min(1),
    documentLocalizationSchemaTypes: z.array(z.string()).default([]),
    fieldLocalizationSchemaTypes: z.array(z.string()).default([]),
    customBlockTypes: z.array(z.string()).optional(),
  })
  .superRefine((value, context) => {
    const documentTypes = new Set(value.documentLocalizationSchemaTypes);
    const overlap = value.fieldLocalizationSchemaTypes.filter((schemaType) =>
      documentTypes.has(schemaType),
    );
    if (overlap.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `A schema type cannot be in both documentLocalizationSchemaTypes and fieldLocalizationSchemaTypes: ${overlap.join(", ")}`,
      });
    }
  });

const bulkConfigSchema = z.object({
  supportedLanguages: z.array(languageSchema).min(1),
  schemaTypes: z.array(z.string()).min(1),
  customBlockTypes: z.array(z.string()).optional(),
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
