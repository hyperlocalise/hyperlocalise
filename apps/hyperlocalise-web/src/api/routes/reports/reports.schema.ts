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
import {
  AI_CHANNELS,
  AI_KEY_TYPES,
  AI_ORIGINS,
  AI_USAGE_DIMENSIONS,
  AI_USAGE_MEASURES,
} from "@/lib/reporting/ai-usage-origins";
import { REPORT_KINDS } from "@/lib/reporting/report-reads";
import {
  RATE_BASES,
  REPORT_STEPS,
  REPORT_UNITS,
  WORD_COUNT_GROUPINGS,
  WORD_COUNT_INTERVALS,
  WORD_COUNT_SPLITS,
} from "@/lib/reporting/report-units";
import { MATCH_BUCKETS } from "@/lib/reporting/word-analysis";
const usd = z.string().regex(/^\d{1,12}(\.\d{1,8})?$/);
const step = z.enum(REPORT_STEPS);
// Reports has nothing from before 2000, and the day maths needs a four-digit year.
const day = z.iso.date().refine((value) => value >= "2000-01-01", { message: "Too early" });
export const budgetSchema = z.object({
  projectId: z.string().min(1),
  budget: usd,
  rateCardName: z.string().trim().min(1).max(100).nullable().default(null),
});
export const taskRateSchema = z.object({
  jobId: z.string().min(1),
  step,
  /** The task's own rate card; each language is priced by that card's line for it. */
  rateCardName: z.string().trim().min(1).max(100).nullable().default(null),
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
  .object({ ...dates, ...scope, unit, step: step.default("translation"), format })
  .refine(datesInOrder, { message: "Invalid date range" });
export const stepTimesQuerySchema = z
  .object({ ...dates, ...scope, format })
  .refine(datesInOrder, { message: "Invalid date range" });
const aiDimension = z.enum(AI_USAGE_DIMENSIONS);
export const aiUsageQuerySchema = z
  .object({
    ...dates,
    projectId: id.optional(),
    groupBy: aiDimension.default("area"),
    thenBy: aiDimension.optional(),
    rankBy: z.enum(AI_USAGE_MEASURES).default("tokens"),
    area: z.enum(AI_ORIGINS).optional(),
    feature: id.optional(),
    model: id.optional(),
    provider: id.optional(),
    channel: z.enum(AI_CHANNELS).optional(),
    key: z.enum(AI_KEY_TYPES).optional(),
    jobId: id.optional(),
    automationId: id.optional(),
    page,
    format,
  })
  .refine(datesInOrder, { message: "Invalid date range" })
  .refine((value) => value.thenBy !== value.groupBy, { message: "Group by two different details" });
const wordSeries = {
  ...dates,
  ...scope,
  unit,
  step: step.default("translation"),
  mode: z.enum(["arrived", "finished"]).default("arrived"),
  split: z.enum(WORD_COUNT_SPLITS).optional(),
  per: z.enum(WORD_COUNT_INTERVALS).optional(),
};
export const wordSeriesQuerySchema = z
  .object(wordSeries)
  .refine(datesInOrder, { message: "Invalid date range" });
export const wordsQuerySchema = z
  .object({
    ...wordSeries,
    groupBy: z.enum(WORD_COUNT_GROUPINGS).default("project"),
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
/** The public `GET /reports` and the MCP tool: one of the page's reports, with its own query. */
export const reportKindSchema = z.enum(REPORT_KINDS);
export const REPORT_QUERY_SCHEMAS = {
  activity: activityQuerySchema,
  words: wordsQuerySchema,
  time: loggedTimeQuerySchema,
  ai: aiUsageQuerySchema,
  costs: costsQuerySchema,
} as const;
/** Up to 50 tasks, as a comma-separated list. */
const jobIds = z
  .string()
  .max(50 * 201)
  .default("")
  .transform((value) => [...new Set(value.split(",").filter(Boolean))])
  .pipe(z.array(id).max(50));
export const costEstimateQuerySchema = z
  .object({
    projectId: id.optional(),
    targetLocale: scope.targetLocale,
    /** An estimate is for chosen tasks, or for the whole of one project. */
    jobIds,
    step: step.optional(),
    unit,
    rateCard: z.string().trim().min(1).max(100).optional(),
    format,
  })
  .refine((v) => v.jobIds.length > 0 || v.projectId, {
    message: "Choose tasks, or one project",
  });
export const taskReportQuerySchema = z.object({
  unit,
  step: step.default("translation"),
  rateCard: z.string().trim().min(1).max(100).optional(),
  format,
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
export const budgetsQuerySchema = z.object({ projectId: id.optional(), format });
