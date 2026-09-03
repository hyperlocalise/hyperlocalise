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

export const visualWorkflowRunTriggerSourceSchema = z.enum([
  "manual",
  "scheduled",
  "github",
  "source_upload",
]);
export const visualWorkflowRunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
]);
export const visualWorkflowNodeRunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "skipped",
]);

export type VisualWorkflowRunTriggerSource = z.infer<typeof visualWorkflowRunTriggerSourceSchema>;
export type VisualWorkflowRunStatus = z.infer<typeof visualWorkflowRunStatusSchema>;
export type VisualWorkflowNodeRunStatus = z.infer<typeof visualWorkflowNodeRunStatusSchema>;

export type VisualWorkflowNodeRunRecord = {
  id: string;
  runId: string;
  organizationId: string;
  nodeId: string;
  nodeType: string;
  status: VisualWorkflowNodeRunStatus;
  inputSnapshot: Record<string, unknown>;
  outputSnapshot: Record<string, unknown>;
  error: Record<string, unknown> | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VisualWorkflowRunRecord = {
  id: string;
  visualWorkflowId: string;
  organizationId: string;
  triggerSource: VisualWorkflowRunTriggerSource;
  status: VisualWorkflowRunStatus;
  idempotencyKey: string | null;
  definitionVersion: number;
  inputSnapshot: Record<string, unknown>;
  outputSummary: Record<string, unknown>;
  error: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  nodeRuns?: VisualWorkflowNodeRunRecord[];
};
