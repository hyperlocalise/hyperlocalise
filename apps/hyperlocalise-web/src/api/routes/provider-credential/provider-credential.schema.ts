import { z } from "zod";

import {
  defaultModelByProvider,
  llmProviderSchema,
  llmProviderCatalog,
} from "@/lib/providers/catalog";

export const updateProviderCredentialBodySchema = z
  .object({
    provider: llmProviderSchema,
    apiKey: z.string().trim().min(1, "API key is required."),
    defaultModel: z.string().trim().min(1, "Default model is required."),
  })
  .superRefine((value, context) => {
    if (
      !(llmProviderCatalog[value.provider].models as readonly string[]).includes(value.defaultModel)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose a supported model for the selected provider.",
        path: ["defaultModel"],
      });
    }
  });

export const revealProviderCredentialBodySchema = z.object({
  confirmed: z.literal(true),
});

export const providerCredentialDefaults = Object.fromEntries(
  Object.entries(defaultModelByProvider).map(([provider, model]) => [provider, model]),
);
