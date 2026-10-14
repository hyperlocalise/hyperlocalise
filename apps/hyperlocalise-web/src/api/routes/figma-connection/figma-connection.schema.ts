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

import { optionalProjectIdSchema, projectIdSchema } from "@/lib/projects/identity/project-id";

export const figmaConnectionIdParamSchema = z.object({
  connectionId: z.string().uuid(),
});

export const createFigmaConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256),
  apiKeyId: z.string().uuid(),
  projectId: projectIdSchema.optional(),
  enabled: z.boolean().optional(),
});

export const bindFigmaProjectBodySchema = z.object({
  projectId: projectIdSchema,
});

export const updateFigmaConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256).optional(),
  apiKeyId: z.string().uuid().optional(),
  projectId: optionalProjectIdSchema.optional(),
  enabled: z.boolean().optional(),
});
