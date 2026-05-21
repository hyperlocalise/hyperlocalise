import { z } from "zod";

export const externalTmsProviderKindSchema = z.enum(["crowdin", "smartling", "phrase", "lokalise"]);

export const upsertExternalTmsProviderCredentialBodySchema = z.object({
  providerKind: externalTmsProviderKindSchema,
  displayName: z.string().trim().min(1).max(256),
  secretMaterial: z.string().trim().min(1).max(4096),
  region: z.string().trim().max(256).optional(),
  baseUrl: z.string().trim().url().max(2048).optional(),
});

export const revealExternalTmsProviderCredentialBodySchema = z.object({
  providerKind: externalTmsProviderKindSchema,
  confirmed: z.literal(true),
});
