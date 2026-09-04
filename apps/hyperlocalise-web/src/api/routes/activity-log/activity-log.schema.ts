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

import { V1_ACTIVITY_EVENT_TYPES } from "@/lib/activity-log/activity-log-contract";
import { ACTIVITY_LOG_RANGES } from "@/lib/activity-log/activity-log-reader";

const actorFilterSchema = z
  .string()
  .trim()
  .max(160)
  .refine(
    (value) =>
      value === "system" ||
      value === "agent" ||
      value === "api_key" ||
      (value.startsWith("user:") &&
        z.string().uuid().safeParse(value.slice("user:".length)).success),
    "Actor filter is invalid",
  );

export const activityLogQuerySchema = z.object({
  actor: actorFilterSchema.optional(),
  cursor: z.string().trim().min(1).max(2048).optional(),
  eventTypes: z.array(z.enum(V1_ACTIVITY_EVENT_TYPES)).default([]),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  range: z.enum(ACTIVITY_LOG_RANGES).default("all"),
});

export type ActivityLogQueryInput = z.infer<typeof activityLogQuerySchema>;
