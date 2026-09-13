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

import { successEnvelopeSchema } from "@/api/response.schema";
import { projectIdSchema } from "@/lib/projects/identity/project-id";
import {
  translationQaCheckTypes,
  translationQaRunStatuses,
  translationQaRunTriggers,
  translationQaScanCadences,
  translationQaSeverities,
} from "@/lib/qa/types";

export const qaReportProjectParamsSchema = z.object({
  projectId: projectIdSchema,
});

export const qaReportRunParamsSchema = qaReportProjectParamsSchema.extend({
  runId: z.string().uuid(),
});

export const qaReportFindingsQuerySchema = z.object({
  locale: z.string().trim().min(1).max(32).optional(),
  checkType: z.enum(translationQaCheckTypes).optional(),
  severity: z.enum(translationQaSeverities).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const qaReportLatestFindingsQuerySchema = z.object({
  locale: z.string().trim().min(1).max(32),
  sourcePath: z.string().trim().min(1).max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const qaReportSettingsBodySchema = z.object({
  cadence: z.enum(translationQaScanCadences),
});

export const qaReportSummarySchema = z.object({
  byCheckType: z.record(z.string(), z.number().int().nonnegative()),
  bySeverity: z.record(z.string(), z.number().int().nonnegative()),
  byLocale: z.record(z.string(), z.number().int().nonnegative()),
});

export const qaReportSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string(),
  trigger: z.enum(translationQaRunTriggers),
  status: z.enum(translationQaRunStatuses),
  segmentCount: z.number().int().nonnegative(),
  findingCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  summary: qaReportSummarySchema,
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const qaReportFindingSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  key: z.string(),
  sourcePath: z.string().nullable(),
  targetLocale: z.string(),
  checkType: z.string(),
  severity: z.enum(translationQaSeverities),
  category: z.string(),
  message: z.string(),
  relatedTokens: z.array(z.string()),
  sourceText: z.string(),
  targetText: z.string(),
  editorHref: z.string(),
});

export const qaReportSettingsSchema = z.object({
  cadence: z.enum(translationQaScanCadences),
  lastRunAt: z.string().nullable(),
  canRun: z.boolean(),
  canManageSchedule: z.boolean(),
});

export const qaReportListResponseSchema = successEnvelopeSchema(
  "reports",
  z.array(qaReportSchema),
).extend({
  settings: qaReportSettingsSchema,
});

export const qaReportCreateResponseSchema = successEnvelopeSchema("report", qaReportSchema);

export const qaReportDetailResponseSchema = successEnvelopeSchema("report", qaReportSchema).extend({
  findings: z.array(qaReportFindingSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
});

export const workspaceQaReportSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  cadence: z.enum(translationQaScanCadences),
  lastRunAt: z.string().nullable(),
  report: qaReportSchema.nullable(),
});

export const workspaceQaReportListResponseSchema = successEnvelopeSchema(
  "reports",
  z.array(workspaceQaReportSchema),
);
