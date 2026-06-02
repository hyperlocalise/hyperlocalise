import { z } from "zod";

export const contentfulConnectionIdParamSchema = z.object({
  connectionId: z.string().uuid(),
});

export const contentfulWebhookSubscriptionParamSchema = z.object({
  subscriptionId: z.string().uuid(),
});

export const contentfulFieldConfigSchema = z
  .object({
    fieldMode: z.enum(["auto", "configured"]).default("auto"),
    fieldsByContentType: z.record(z.string(), z.array(z.string().trim().min(1))).optional(),
    overwriteDraftLocales: z.boolean().default(false),
  })
  .default({ fieldMode: "auto", overwriteDraftLocales: false });

export const createContentfulConnectionBodySchema = z.object({
  projectId: z.string().trim().min(1).max(128),
  displayName: z.string().trim().min(1).max(256),
  spaceId: z.string().trim().min(1).max(128),
  environmentId: z.string().trim().min(1).max(128).default("master"),
  sourceLocale: z.string().trim().min(1).max(32),
  targetLocales: z.array(z.string().trim().min(1).max(32)).min(1).max(20),
  contentTypeIds: z.array(z.string().trim().min(1).max(128)).max(50).default([]),
  fieldConfig: contentfulFieldConfigSchema,
  accessToken: z.string().trim().min(1).max(4096),
  enabled: z.boolean().default(true),
});

export const updateContentfulConnectionBodySchema = z.object({
  projectId: z.string().trim().min(1).max(128).optional(),
  displayName: z.string().trim().min(1).max(256).optional(),
  spaceId: z.string().trim().min(1).max(128).optional(),
  environmentId: z.string().trim().min(1).max(128).optional(),
  sourceLocale: z.string().trim().min(1).max(32).optional(),
  targetLocales: z.array(z.string().trim().min(1).max(32)).min(1).max(20).optional(),
  contentTypeIds: z.array(z.string().trim().min(1).max(128)).max(50).optional(),
  fieldConfig: contentfulFieldConfigSchema.optional(),
  accessToken: z.string().trim().min(1).max(4096).optional(),
  enabled: z.boolean().optional(),
});
