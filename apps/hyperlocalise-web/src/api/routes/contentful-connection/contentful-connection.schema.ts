import { z } from "zod";

import { optionalProjectIdSchema } from "@/lib/projects/project-id";

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
  displayName: z.string().trim().min(1).max(256),
  spaceId: z.string().trim().min(1).max(128),
  environmentId: z.string().trim().min(1).max(128).default("master"),
  /** @deprecated Use automation tool config instead. */
  projectId: optionalProjectIdSchema.optional(),
  /** @deprecated Use automation tool config instead. */
  sourceLocale: z.string().trim().min(1).max(32).optional(),
  /** @deprecated Use automation tool config instead. */
  targetLocales: z.array(z.string().trim().min(1).max(32)).min(1).max(20).optional(),
  contentTypeIds: z.array(z.string().trim().min(1).max(128)).max(50).default([]),
  fieldConfig: contentfulFieldConfigSchema,
  accessToken: z.string().trim().min(1).max(4096),
  enabled: z.boolean().default(true),
});

export const updateContentfulConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256).optional(),
  spaceId: z.string().trim().min(1).max(128).optional(),
  environmentId: z.string().trim().min(1).max(128).optional(),
  /** @deprecated Use automation tool config instead. */
  projectId: optionalProjectIdSchema.optional(),
  /** @deprecated Use automation tool config instead. */
  sourceLocale: z.string().trim().min(1).max(32).optional(),
  /** @deprecated Use automation tool config instead. */
  targetLocales: z.array(z.string().trim().min(1).max(32)).min(1).max(20).optional(),
  contentTypeIds: z.array(z.string().trim().min(1).max(128)).max(50).optional(),
  fieldConfig: contentfulFieldConfigSchema.optional(),
  accessToken: z.string().trim().min(1).max(4096).optional(),
  enabled: z.boolean().optional(),
});

export const discoverContentfulSpaceBodySchema = z
  .object({
    spaceId: z.string().trim().min(1).max(128),
    environmentId: z.string().trim().min(1).max(128).default("master"),
    accessToken: z.string().trim().min(1).max(4096).optional(),
    connectionId: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.accessToken && !value.connectionId) {
      ctx.addIssue({
        code: "custom",
        message: "accessToken or connectionId is required",
        path: ["accessToken"],
      });
    }
  });
