import { z } from "zod";

import {
  providerQaCheckTypes,
  providerQaSeverityLevels,
} from "@/lib/providers/provider-job-qa/types";

export const providerQaItemReferenceSchema = z.object({
  externalStringId: z.string().trim().min(1).max(128),
  key: z.string().trim().min(1).max(512),
  locale: z.string().trim().min(1).max(32).optional(),
  field: z.enum(["source", "target"]).optional(),
});

export const providerQaFindingSchema = z.object({
  checkType: z.enum(providerQaCheckTypes),
  severity: z.enum(providerQaSeverityLevels),
  message: z.string().trim().min(1).max(2048),
  suggestedFix: z.string().max(100_000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  item: providerQaItemReferenceSchema,
});

export const providerQaSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  byCheckType: z.record(z.string(), z.number().int().nonnegative()),
  bySeverity: z.record(z.string(), z.number().int().nonnegative()),
});

export const providerQaReportSchema = z.object({
  findings: z.array(providerQaFindingSchema),
  summary: providerQaSummarySchema,
});

export const providerReviewAuthorSchema = z.object({
  externalUserId: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
});

export const providerReviewCommentSchema = z.object({
  externalCommentId: z.string(),
  body: z.string(),
  author: providerReviewAuthorSchema.nullable().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});

export const providerReviewContextSchema = z.object({
  externalProjectId: z.string(),
  externalJobId: z.string(),
  externalThreadId: z.string(),
  externalCommentId: z.string().nullable().optional(),
  providerUrl: z.string().nullable().optional(),
});

export const providerReviewThreadSchema = z.object({
  threadId: z.string(),
  kind: z.enum(["issue", "comment", "task_comment"]),
  state: z.enum(["open", "resolved", "unknown"]),
  subject: z.string().nullable().optional(),
  issueType: z.string().nullable().optional(),
  item: providerQaItemReferenceSchema.nullable().optional(),
  locale: z.string().nullable().optional(),
  comments: z.array(providerReviewCommentSchema),
  author: providerReviewAuthorSchema.nullable().optional(),
  resolver: providerReviewAuthorSchema.nullable().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  providerContext: providerReviewContextSchema,
});

export const providerReviewSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  open: z.number().int().nonnegative(),
  resolved: z.number().int().nonnegative(),
  byKind: z.record(z.string(), z.number().int().nonnegative()),
});

export const providerReviewReportSchema = z.object({
  threads: z.array(providerReviewThreadSchema),
  summary: providerReviewSummarySchema,
});

export const providerQaReportResponseSchema = z.object({
  qaReport: providerQaReportSchema.extend({
    pullRunId: z.string(),
  }),
});
