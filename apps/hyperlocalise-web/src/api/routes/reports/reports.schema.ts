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
import { RATE_BASES, REPORT_STEPS, REPORT_UNITS } from "@/lib/reporting/report-units";
import { MATCH_BUCKETS } from "@/lib/reporting/word-analysis";
const usd = z.string().regex(/^\d{1,12}(\.\d{1,8})?$/);
const step = z.enum(REPORT_STEPS);
const day = z.iso.date();
export const reportQuerySchema = z
  .object({
    from: day.optional(),
    to: day.optional(),
    projectId: z.string().optional(),
    jobId: z.string().optional(),
    targetLocale: z.string().optional(),
    step: step.optional(),
    interval: z.enum(["day", "week"]).default("week"),
    view: z.enum(["overview", "words", "time", "costs"]).default("overview"),
    format: z.enum(["json", "csv"]).default("json"),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "Invalid date range" });
export const wordCountQuerySchema = z
  .object({
    from: day.optional(),
    to: day.optional(),
    projectId: z.string().optional(),
    jobId: z.string().optional(),
    targetLocale: z.string().optional(),
    step: step.optional(),
    groupBy: z.enum(["project", "job"]).default("project"),
    format: z.enum(["json", "csv"]).default("json"),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "Invalid date range" });
export const exportFormatSchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
});
export const reportJobsQuerySchema = z.object({ projectId: z.string().optional() });
export const rateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  sourceLocale: z.string().min(2).max(35),
  targetLocale: z.string().min(2).max(35),
  step,
  basis: z.enum(RATE_BASES),
  rate: usd,
  percentages: z.partialRecord(z.enum(MATCH_BUCKETS), z.number().int().min(0).max(100)).default({}),
});
export const budgetSchema = z.object({
  projectId: z.string().min(1),
  budget: usd,
  rateCardName: z.string().max(100).nullable().default(null),
});
export const taskRateSchema = z.object({
  jobId: z.string().min(1),
  step,
  rateId: z.uuid().nullable().default(null),
  estimatedMinutes: z.number().int().nonnegative().max(525600).nullable().default(null),
  overrideUsd: usd.nullable().default(null),
});
export const timeSchema = z.object({
  jobId: z.string().min(1),
  step,
  targetLocale: z.string().min(2).max(35),
  workDate: day,
  minutes: z.number().int().min(1).max(1440),
  note: z.string().max(2000).optional(),
});
export const expenseSchema = z.object({
  projectId: z.string().min(1),
  jobId: z.string().optional(),
  step,
  amountUsd: usd,
  note: z.string().trim().min(1).max(2000),
  operationKey: z.uuid(),
});

export const timeUpdateSchema = timeSchema.pick({ minutes: true, workDate: true, note: true });

const unit = z.enum(REPORT_UNITS).default("words");
const format = z.enum(["json", "csv"]).default("json");
const page = z.coerce.number().int().min(1).max(10_000).default(1);
const id = z.string().min(1).max(200);
const datesInOrder = (value: { from?: string; to?: string }) =>
  !value.from || !value.to || value.from <= value.to;
const dates = { from: day.optional(), to: day.optional() };
const scope = {
  projectId: id.optional(),
  targetLocale: z.string().min(2).max(35).optional(),
  jobId: id.optional(),
};

export const activityQuerySchema = z
  .object({ ...dates, ...scope, unit })
  .refine(datesInOrder, { message: "Invalid date range" });
export const stepTimesQuerySchema = z
  .object({ ...dates, ...scope, format })
  .refine(datesInOrder, { message: "Invalid date range" });
export const aiUsageQuerySchema = z
  .object({
    ...dates,
    projectId: id.optional(),
    groupBy: z.enum(["origin", "model"]).default("origin"),
    format,
  })
  .refine(datesInOrder, { message: "Invalid date range" });
export const wordsQuerySchema = z
  .object({
    ...dates,
    ...scope,
    unit,
    step: step.default("translation"),
    mode: z.enum(["arrived", "finished"]).default("arrived"),
    groupBy: z.enum(["project", "task"]).default("project"),
    page,
    format,
  })
  .refine(datesInOrder, { message: "Invalid date range" });
export const loggedTimeQuerySchema = z
  .object({ ...dates, ...scope, page, format })
  .refine(datesInOrder, { message: "Invalid date range" });
export const costsQuerySchema = z
  .object({ ...dates, projectId: id.optional(), targetLocale: scope.targetLocale, format })
  .refine(datesInOrder, { message: "Invalid date range" });
/** Up to 50 tasks, as a comma-separated list. */
const jobIds = z
  .string()
  .max(50 * 201)
  .transform((value) => [...new Set(value.split(",").filter(Boolean))])
  .pipe(z.array(id).max(50));
export const costEstimateQuerySchema = z.object({
  projectId: id.optional(),
  targetLocale: scope.targetLocale,
  /** An estimate is for chosen tasks: at least one. */
  jobIds: jobIds.pipe(z.array(id).min(1)),
  step: step.optional(),
  unit,
  rateCard: z.string().trim().min(1).max(100).optional(),
  format,
});
export const taskReportQuerySchema = z.object({
  unit,
  step: step.default("translation"),
  rateCard: z.string().trim().min(1).max(100).optional(),
});
export const reportTaskSearchSchema = z.object({
  projectId: id.optional(),
  q: z.string().trim().max(200).optional(),
  open: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ids: jobIds.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const rateLineSchema = z.object({
  sourceLocale: z.string().min(2).max(35),
  targetLocale: z.string().min(2).max(35),
  step,
  basis: z.enum(RATE_BASES),
  rate: usd,
  percentages: z.partialRecord(z.enum(MATCH_BUCKETS), z.number().int().min(0).max(100)).default({}),
});
export const rateCardSchema = z.object({
  name: z.string().trim().min(1).max(100),
  defaultBasis: z.enum(RATE_BASES).default("word"),
  lines: z.array(rateLineSchema).max(1000),
  /** Save as a new card; the name must not be taken. */
  create: z.boolean().default(false),
});
