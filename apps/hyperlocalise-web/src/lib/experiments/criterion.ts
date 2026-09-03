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

import type {
  ExperimentCriterionMatch,
  ExperimentCriterionNode,
} from "@/lib/database/schema/experiments";

export const EXPERIMENT_CRITERION_MATCHES = [
  "exact",
  "gt",
  "gte",
  "lt",
  "lte",
  "is_null",
  "is_not_null",
  "in",
  "contains_substring",
  "contains_any",
  "contains_substring_any",
] as const satisfies readonly ExperimentCriterionMatch[];

const experimentCriterionMatchSchema = z.enum(EXPERIMENT_CRITERION_MATCHES);

const experimentCriterionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export const experimentCriterionNodeSchema: z.ZodType<ExperimentCriterionNode> = z.lazy(() =>
  z.union([
    z.object({
      type: z.enum(["and", "or", "not"]),
      children: z.array(experimentCriterionNodeSchema).min(1),
    }),
    z.object({
      type: z.literal("attribute"),
      name: z.string().trim().min(1).max(255),
      match: experimentCriterionMatchSchema,
      value: experimentCriterionValueSchema.optional(),
    }),
  ]),
);
