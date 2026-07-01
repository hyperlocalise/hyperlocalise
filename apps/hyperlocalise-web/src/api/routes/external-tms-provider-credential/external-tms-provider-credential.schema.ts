import { z } from "zod";

import { optionalProjectIdSchema } from "@/lib/projects/identity/project-id";

export const externalTmsProviderKindSchema = z.enum(["crowdin", "smartling", "phrase", "lokalise"]);

export const upsertExternalTmsProviderCredentialBodySchema = z.object({
  providerKind: externalTmsProviderKindSchema,
  displayName: z.string().trim().min(1).max(256),
  secretMaterial: z.string().trim().min(1).max(4096),
  region: z.string().trim().max(256).optional(),
  baseUrl: z.string().trim().url().max(2048).optional(),
});

const oauthAppSettingsBodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(256),
    oauthClientId: z.string().trim().min(1).max(512).optional(),
    oauthClientSecret: z.string().trim().min(1).max(4096).optional(),
    baseUrl: z.string().trim().url().max(2048).optional(),
  })
  .superRefine((value, ctx) => {
    const hasClientId = Boolean(value.oauthClientId);
    const hasClientSecret = Boolean(value.oauthClientSecret);
    if (hasClientId !== hasClientSecret) {
      ctx.addIssue({
        code: "custom",
        message: "oauth_client_credentials_incomplete",
        path: hasClientId ? ["oauthClientSecret"] : ["oauthClientId"],
      });
    }
  });

export const crowdinOAuthStartBodySchema = oauthAppSettingsBodySchema;

export const crowdinPatSetupBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256),
  baseUrl: z.string().trim().url().max(2048).optional(),
});

export const crowdinUserPatBodySchema = z.object({
  personalAccessToken: z.string().trim().min(1).max(4096),
});

export const phraseOAuthStartBodySchema = crowdinOAuthStartBodySchema;
export const lokaliseOAuthStartBodySchema = crowdinOAuthStartBodySchema;

export const crowdinUserOAuthStartBodySchema = z.object({
  returnTo: z.string().trim().max(2048).optional(),
});

export const phraseUserOAuthStartBodySchema = crowdinUserOAuthStartBodySchema;
export const lokaliseUserOAuthStartBodySchema = crowdinUserOAuthStartBodySchema;

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
