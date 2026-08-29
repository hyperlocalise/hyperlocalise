/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { z } from "zod";

export const defaultApiKeyPermissions = [
  "jobs:read",
  "jobs:write",
  "files:read",
  "files:write",
] as const;

export const apiKeyPermissionSchema = z.enum(defaultApiKeyPermissions);

export const createApiKeyBodySchema = z.object({
  name: z.string().trim().min(1).max(128),
  permissions: z.array(apiKeyPermissionSchema).optional(),
});

export const apiKeyIdParamsSchema = z.object({
  apiKeyId: z.string().trim().uuid(),
});

/** The user a token acts as. Never a display-only field: it is the token's authority. */
export const apiKeyOwnerSchema = z.object({
  userId: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
});

export const apiKeySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  permissions: z.array(apiKeyPermissionSchema),
  lastUsedAt: z.string().nullable().optional(),
  revokedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  // Null only for legacy rows with no resolvable owner. Such a token is
  // unusable and is always presented as revoked.
  owner: apiKeyOwnerSchema.nullable(),
});

export const createdApiKeySchema = apiKeySummarySchema
  .pick({
    id: true,
    name: true,
    keyPrefix: true,
    permissions: true,
    createdAt: true,
    owner: true,
  })
  .extend({
    key: z.string(),
  });

export const apiKeysResponseSchema = z.object({
  apiKeys: z.array(apiKeySummarySchema),
});

export const apiKeyResponseSchema = z.object({
  apiKey: createdApiKeySchema,
});

export type CreateApiKeyBody = z.infer<typeof createApiKeyBodySchema>;
export type ApiKeyIdParams = z.infer<typeof apiKeyIdParamsSchema>;
export type ApiKeyPermission = z.infer<typeof apiKeyPermissionSchema>;
export type ApiKeyOwner = z.infer<typeof apiKeyOwnerSchema>;
export type ApiKeySummary = z.infer<typeof apiKeySummarySchema>;
export type CreatedApiKey = z.infer<typeof createdApiKeySchema>;
export type ApiKeysResponse = z.infer<typeof apiKeysResponseSchema>;
export type ApiKeyResponse = z.infer<typeof apiKeyResponseSchema>;
