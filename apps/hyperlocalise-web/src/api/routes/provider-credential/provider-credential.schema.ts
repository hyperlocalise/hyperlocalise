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

export const providerCredentialSummarySchema = z.object({
  organizationId: z.string(),
  provider: llmProviderSchema,
  defaultModel: z.string(),
  maskedApiKeySuffix: z.string(),
  lastValidatedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const providerCredentialResponseSchema = z.object({
  providerCredential: providerCredentialSummarySchema.nullable(),
});

export const revealedProviderCredentialResponseSchema = z.object({
  providerCredential: z.object({
    summary: providerCredentialSummarySchema,
    apiKey: z.string(),
  }),
});

export const providerCredentialDefaults = Object.fromEntries(
  Object.entries(defaultModelByProvider).map(([provider, model]) => [provider, model]),
);

export type UpdateProviderCredentialBody = z.infer<typeof updateProviderCredentialBodySchema>;
export type RevealProviderCredentialBody = z.infer<typeof revealProviderCredentialBodySchema>;
export type ProviderCredentialSummary = z.infer<typeof providerCredentialSummarySchema>;
export type ProviderCredentialResponse = z.infer<typeof providerCredentialResponseSchema>;
export type RevealedProviderCredentialResponse = z.infer<
  typeof revealedProviderCredentialResponseSchema
>;
