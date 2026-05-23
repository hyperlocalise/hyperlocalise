import { z } from "zod";

import {
  providerQaCheckTypes,
  providerQaSeverityLevels,
} from "@/lib/providers/provider-job-qa/types";

export const providerQaItemReferenceSchema = z.object({
  externalStringId: z.string(),
  key: z.string(),
  locale: z.string().optional(),
  field: z.enum(["source", "target"]).optional(),
});

export const providerQaFindingSchema = z.object({
  checkType: z.enum(providerQaCheckTypes),
  severity: z.enum(providerQaSeverityLevels),
  message: z.string(),
  suggestedFix: z.string().optional(),
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

export const providerQaReportResponseSchema = z.object({
  qaReport: providerQaReportSchema.extend({
    pullRunId: z.string(),
  }),
});
