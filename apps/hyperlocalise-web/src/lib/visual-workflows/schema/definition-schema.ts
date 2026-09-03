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

import { VISUAL_WORKFLOW_SCHEMA_VERSION } from "./types";

const httpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const visualWorkflowScheduleSchema = z.object({
  cadence: z.enum(["hourly", "daily", "weekly"]),
  hourUtc: z.number().int().min(0).max(23).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});

const branchPatternSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9._\-/*?]+$/);

const visualCatalogTypeSchema = z.enum([
  "trigger.manual",
  "trigger.scheduled",
  "trigger.github",
  "trigger.source_upload",
  "action.http",
  "action.notify_slack",
  "logic.if",
  "ai.agent",
  "logic.for_each",
]);

const visualNodeConfigSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("trigger.manual") }),
  z.object({
    kind: z.literal("trigger.scheduled"),
    schedule: visualWorkflowScheduleSchema,
  }),
  z.object({
    kind: z.literal("trigger.github"),
    githubInstallationRepositoryId: z.string().uuid(),
    branches: z.array(branchPatternSchema).min(1).max(32),
    events: z
      .array(z.enum(["push", "pull_request"]))
      .min(1)
      .max(2)
      .optional(),
  }),
  z.object({
    kind: z.literal("trigger.source_upload"),
    projectId: z.string().trim().min(1).max(128).optional(),
  }),
  z.object({
    kind: z.literal("action.http"),
    method: httpMethodSchema,
    url: z.string().max(2048),
  }),
  z.object({
    kind: z.literal("action.notify_slack"),
    channelId: z.string().trim().min(1).max(64),
    message: z.string().max(4000),
  }),
  z.object({
    kind: z.literal("logic.if"),
    condition: z.string().max(2000),
  }),
  z.object({
    kind: z.literal("ai.agent"),
    prompt: z.string().max(20_000),
  }),
  z.object({
    kind: z.literal("logic.for_each"),
    collection: z.string().max(2000),
  }),
]);

const visualWorkflowNodeSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    type: visualCatalogTypeSchema,
    config: visualNodeConfigSchema,
  })
  .strict();

const visualWorkflowEdgeSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    source: z.string().trim().min(1).max(128),
    target: z.string().trim().min(1).max(128),
    sourceHandle: z.string().max(64).nullable(),
    targetHandle: z.string().max(64).nullable(),
  })
  .strict();

export const visualWorkflowDefinitionSchema = z
  .object({
    schemaVersion: z.literal(VISUAL_WORKFLOW_SCHEMA_VERSION),
    name: z.string().trim().min(1).max(120),
    nodes: z.array(visualWorkflowNodeSchema).max(200),
    edges: z.array(visualWorkflowEdgeSchema).max(400),
    editor: z
      .object({
        positions: z.record(
          z.string(),
          z.object({ x: z.number().finite(), y: z.number().finite() }),
        ),
      })
      .strict(),
  })
  .strict();

export type VisualWorkflowDefinitionInput = z.infer<typeof visualWorkflowDefinitionSchema>;
