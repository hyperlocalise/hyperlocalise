/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { z } from "zod";

import {
  workspaceAutomationConfigSchema,
  workspaceAutomationStatusSchema,
} from "@/lib/agents/workspace-automations";

export const workspaceAutomationIdParamSchema = z.object({
  automationId: z.string().uuid(),
});

export const listWorkspaceAutomationsQuerySchema = z.object({
  status: workspaceAutomationStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createWorkspaceAutomationBodySchema = workspaceAutomationConfigSchema
  .extend({
    status: workspaceAutomationStatusSchema.optional(),
    name: z.string().trim().min(1).max(120),
    instructions: z.string().trim().min(1).max(20_000),
    nextRunAt: z.string().datetime().nullable().optional(),
  })
  .strict();

export const updateWorkspaceAutomationBodySchema = workspaceAutomationConfigSchema
  .partial()
  .extend({
    status: workspaceAutomationStatusSchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    instructions: z.string().trim().min(1).max(20_000).optional(),
    nextRunAt: z.string().datetime().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Expected at least one automation field",
  });

export const createWorkspaceAutomationRunBodySchema = z
  .object({
    idempotencyKey: z.string().trim().min(1).max(200),
    inputSnapshot: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const listWorkspaceAutomationRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
