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

import { visualWorkflowDefinitionSchema } from "@/lib/visual-workflows/schema/definition-schema";
import { visualWorkflowStatusSchema } from "@/lib/visual-workflows/visual-workflow-types";
import { optionalProjectIdSchema } from "@/lib/projects/identity/project-id";

export const visualWorkflowIdParamSchema = z.object({
  visualWorkflowId: z.string().uuid(),
});

export const listVisualWorkflowsQuerySchema = z.object({
  status: visualWorkflowStatusSchema.optional(),
  projectId: optionalProjectIdSchema,
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createVisualWorkflowBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    projectId: optionalProjectIdSchema,
    status: visualWorkflowStatusSchema.optional(),
    definition: visualWorkflowDefinitionSchema.optional(),
  })
  .strict();

export const updateVisualWorkflowBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    projectId: optionalProjectIdSchema.nullable().optional(),
    status: visualWorkflowStatusSchema.optional(),
    definition: visualWorkflowDefinitionSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Expected at least one visual workflow field",
  });

export const visualWorkflowRunIdParamSchema = visualWorkflowIdParamSchema.extend({
  runId: z.string().uuid(),
});

export const listVisualWorkflowRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createVisualWorkflowRunBodySchema = z
  .object({
    idempotencyKey: z.string().trim().min(1).max(200),
    inputSnapshot: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
