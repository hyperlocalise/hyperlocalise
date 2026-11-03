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
import {
  REPORT_STEPS,
  REPORT_UNITS,
  WORD_COUNT_GROUPINGS,
  WORD_COUNT_INTERVALS,
  WORD_COUNT_SPLITS,
} from "@/lib/reporting/report-units";

/** The reports the MCP `get_report` tool offers, and the input it accepts for each. */
export const REPORT_KINDS = ["activity", "words", "time", "ai", "costs"] as const;

const step = z.enum(REPORT_STEPS);
// Reports has nothing from before 2000, and the day maths needs a four-digit year.
const day = z.iso.date().refine((value) => value >= "2000-01-01", { message: "Too early" });
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
const aiDimension = z.enum(AI_USAGE_DIMENSIONS);

export const REPORT_QUERY_SCHEMAS = {
  activity: z
    .object({ ...dates, ...scope, unit, step: step.default("translation"), format })
    .refine(datesInOrder, { message: "Invalid date range" }),
  words: z
    .object({
      ...dates,
      ...scope,
      unit,
      step: step.default("translation"),
      mode: z.enum(["arrived", "finished"]).default("arrived"),
      groupBy: z.enum(WORD_COUNT_GROUPINGS).default("project"),
      page,
      format,
      split: z.enum(WORD_COUNT_SPLITS).optional(),
      per: z.enum(WORD_COUNT_INTERVALS).optional(),
    })
    .refine(datesInOrder, { message: "Invalid date range" }),
  time: z
    .object({ ...dates, ...scope, page, format })
    .refine(datesInOrder, { message: "Invalid date range" }),
  ai: z
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
    .refine((value) => value.thenBy !== value.groupBy, {
      message: "Group by two different details",
    }),
  costs: z
    .object({ ...dates, projectId: id.optional(), targetLocale: scope.targetLocale, format })
    .refine(datesInOrder, { message: "Invalid date range" }),
} as const;
