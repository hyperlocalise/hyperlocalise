import { z } from "zod";

import { optionalProjectIdSchema } from "@/lib/projects/project-id";

export const externalTmsProviderKindSchema = z.enum(["crowdin", "smartling", "phrase", "lokalise"]);

export const upsertExternalTmsProviderCredentialBodySchema = z.object({
  providerKind: externalTmsProviderKindSchema,
  displayName: z.string().trim().min(1).max(256),
  secretMaterial: z.string().trim().min(1).max(4096),
  region: z.string().trim().max(256).optional(),
  baseUrl: z.string().trim().url().max(2048).optional(),
});

export const crowdinOAuthStartBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256),
  oauthClientId: z.string().trim().min(1).max(512),
  oauthClientSecret: z.string().trim().min(1).max(4096),
  baseUrl: z.string().trim().url().max(2048).optional(),
});

export const phraseOAuthStartBodySchema = crowdinOAuthStartBodySchema;

export const crowdinUserOAuthStartBodySchema = z.object({
  returnTo: z.string().trim().max(2048).optional(),
});

export const phraseUserOAuthStartBodySchema = crowdinUserOAuthStartBodySchema;

export const revealExternalTmsProviderCredentialBodySchema = z.object({
  providerKind: externalTmsProviderKindSchema,
  confirmed: z.literal(true),
});

export const providerSyncObservabilityQuerySchema = z.object({
  projectId: optionalProjectIdSchema,
});

export const externalTmsProviderHealthResponseSchema = z.object({
  externalTmsProviderHealth: z.object({
    providerKind: externalTmsProviderKindSchema,
    status: z.enum(["connected", "degraded", "error"]),
    availability: z.enum(["available", "unavailable", "unknown"]),
    authValidity: z.enum(["valid", "invalid", "unknown"]),
    errorCode: z.string().nullable(),
    message: z.string().nullable(),
    rateLimit: z.object({
      limit: z.string().nullable(),
      remaining: z.string().nullable(),
      resetAt: z.string().nullable(),
      retryAfter: z.string().nullable(),
    }),
    lastSuccessfulSyncAt: z.string().datetime().nullable(),
    checkedAt: z.string().datetime(),
  }),
});
