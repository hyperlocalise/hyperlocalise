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

import { experimentCriterionNodeSchema } from "@/lib/experiments/criterion";
import { EXPERIMENT_FLAG_KEY_PATTERN } from "@/lib/experiments/flag-key";

export const experimentFlagKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(EXPERIMENT_FLAG_KEY_PATTERN);

export const experimentIdParamsSchema = z.object({
  experimentId: z.string().uuid(),
});

export const flagIdParamsSchema = z.object({
  flagId: z.string().uuid(),
});

export const audienceIdParamsSchema = z.object({
  audienceId: z.string().uuid(),
});

export const variantIdParamsSchema = z.object({
  variantId: z.string().uuid(),
});

export const assignmentIdParamsSchema = z.object({
  assignmentId: z.string().uuid(),
});

export const clientKeyIdParamsSchema = z.object({
  keyId: z.string().uuid(),
});

export const createFlagBodySchema = z.object({
  key: experimentFlagKeySchema,
  description: z.string().trim().max(2000).optional(),
  kind: z.enum(["experiment", "config"]).default("experiment"),
});

export const updateFlagBodySchema = z.object({
  description: z.string().trim().max(2000).nullable().optional(),
});

export const upsertFlagConfigBodySchema = z.object({
  value: z.unknown(),
});

export const createAudienceBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional(),
  criterion: experimentCriterionNodeSchema.nullable().optional(),
});

export const updateAudienceBodySchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  criterion: experimentCriterionNodeSchema.nullable().optional(),
});

export const createExperimentBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  kind: z.enum(["toggle", "ab"]).default("toggle"),
  audienceId: z.string().uuid().nullable().optional(),
  rolloutPercentage: z.number().int().min(0).max(10000).optional(),
  startAt: z.string().datetime({ offset: true }).optional(),
  endAt: z.string().datetime({ offset: true }).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});

export const updateExperimentBodySchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  audienceId: z.string().uuid().nullable().optional(),
  rolloutPercentage: z.number().int().min(0).max(10000).optional(),
  startAt: z.string().datetime({ offset: true }).optional(),
  endAt: z.string().datetime({ offset: true }).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});

export const createVariantBodySchema = z.object({
  key: experimentFlagKeySchema,
  audienceId: z.string().uuid().nullable().optional(),
  rolloutPercentage: z.number().int().min(0).max(10000).optional(),
  isControl: z.boolean().optional(),
});

export const updateVariantBodySchema = z.object({
  audienceId: z.string().uuid().nullable().optional(),
  rolloutPercentage: z.number().int().min(0).max(10000).optional(),
  isControl: z.boolean().optional(),
});

export const createAssignmentBodySchema = z.object({
  flagId: z.string().uuid(),
  variantId: z.string().uuid(),
  enabled: z.boolean().optional(),
  payload: z.unknown().optional(),
});

export const updateAssignmentBodySchema = z.object({
  enabled: z.boolean().optional(),
  payload: z.unknown().nullable().optional(),
});

export const createClientKeyBodySchema = z.object({
  name: z.string().trim().min(1).max(128),
});
