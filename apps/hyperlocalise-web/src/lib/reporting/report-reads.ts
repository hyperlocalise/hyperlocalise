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
import { sql } from "drizzle-orm";

import { db } from "@/lib/database/client";

import { queryAiUsage } from "./ai-usage";
import type { AiChannel, AiKeyType, AiOrigin, AiUsageDimension } from "./ai-usage-origins";
import { queryCosts } from "./cost-queries";
import { resolvePeriod } from "./report-period";
import type { ReportStep, ReportUnit } from "./report-units";
import { queryAutomatedTime, queryLoggedTime } from "./time-queries";
import {
  queryActivity,
  queryFinishedByLanguage,
  queryFinishedSeries,
  queryWordCounts,
} from "./word-queries";

/**
 * The reads behind the Reports page's tabs, shared by the page's endpoints, the public
 * `GET /reports` and the MCP `get_report` tool, so every reader gets the same figures from the
 * same summary.
 */

export const REPORT_KINDS = ["activity", "words", "time", "ai", "costs"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export type ReportReadContext = {
  organizationId: string;
  /** The projects the viewer can open. */
  projectIds: string[];
  /** The first day Reports can cover for the workspace; null before anything was recorded. */
  startedDay: string | null;
  today: string;
  /** Whether the viewer sees what work costs, other people's time and workspace-wide work. */
  financial: boolean;
  /** The viewer, whose own time is all a non-billing role sees. */
  userId: string;
};

type Dates = { from?: string; to?: string };
type Scope = { projectId?: string; jobId?: string; targetLocale?: string };

export type ActivityReadQuery = Dates & Scope & { unit: ReportUnit; step: ReportStep };
export type WordsReadQuery = Dates &
  Scope & {
    unit: ReportUnit;
    step: ReportStep;
    mode: "arrived" | "finished";
    groupBy: "project" | "task" | "week";
    page: number;
    /** Every row, for a download. */
    all?: boolean;
  };
export type TimeReadQuery = Dates & Scope & { page: number; all?: boolean };
export type CostsReadQuery = Dates & { projectId?: string; targetLocale?: string };
export type AiReadQuery = Dates & {
  projectId?: string;
  groupBy: AiUsageDimension;
  thenBy?: AiUsageDimension;
  area?: AiOrigin;
  feature?: string;
  model?: string;
  provider?: string;
  channel?: AiChannel;
  key?: AiKeyType;
  jobId?: string;
  automationId?: string;
  page: number;
  /** Every group, for a download. */
  all?: boolean;
};

export type ReportReadQuery = {
  activity: ActivityReadQuery;
  words: WordsReadQuery;
  time: TimeReadQuery;
  ai: AiReadQuery;
  costs: CostsReadQuery;
};

/** The query's filters as the queries take them: a period, and the task as a list of one. */
function scope<Q extends Dates & Scope>(context: ReportReadContext, query: Q) {
  const period = resolvePeriod({ ...query, ...context });
  const { jobId, ...filters } = query;
  return { ...context, ...filters, jobIds: jobId ? [jobId] : undefined, period };
}

/** The Activity tab: headline totals for the period and the one before, and the charts. */
export async function readActivity(context: ReportReadContext, query: ActivityReadQuery) {
  const { step, ...rest } = query;
  const read = scope(context, rest);
  // The headline totals cover both steps; the charts show the chosen one.
  const [totals, series, byLanguage] = await Promise.all([
    queryActivity({ ...read, step }),
    queryFinishedSeries({ ...read, step }),
    queryFinishedByLanguage({ ...read, step }),
  ]);
  return { period: read.period, unit: query.unit, step, ...totals, series, byLanguage };
}

/** The Word counts tab: units by match band, by project or a page of tasks. */
export async function readWords(context: ReportReadContext, query: WordsReadQuery) {
  const { all, ...rest } = query;
  const read = scope(context, rest);
  const counts = await queryWordCounts({ ...read, all });
  return {
    period: read.period,
    unit: query.unit,
    step: query.step,
    mode: query.mode,
    groupBy: query.groupBy,
    ...counts,
  };
}

/** The Time tab: time people logged, and automated run time for the roles that see it. */
export async function readTime(context: ReportReadContext, query: TimeReadQuery) {
  const { all, ...rest } = query;
  const read = scope(context, rest);
  // Roles that cannot see what work costs see only their own time, and no automated time.
  const [logged, automated] = await Promise.all([
    queryLoggedTime({
      ...read,
      all,
      contributorId: context.financial ? undefined : context.userId,
    }),
    context.financial
      ? queryAutomatedTime({
          ...context,
          projectId: query.projectId,
          period: read.period,
          includeUnattributed: true,
        })
      : null,
  ]);
  return { period: read.period, logged, automated };
}

/**
 * The AI usage tab: calls, tokens, images, videos and billing's charge, grouped by one detail
 * and optionally a second. AI used outside any project counts for the roles that see billing.
 */
export async function readAi(context: ReportReadContext, query: AiReadQuery) {
  const period = resolvePeriod({ ...query, ...context });
  return queryAiUsage({
    ...context,
    projectId: query.projectId,
    period,
    includeUnattributed: context.financial,
    groupBy: query.groupBy,
    thenBy: query.thenBy,
    page: query.page,
    all: query.all,
    filters: {
      area: query.area,
      feature: query.feature,
      model: query.model,
      provider: query.provider,
      channel: query.channel,
      key: query.key,
      task: query.jobId,
      automation: query.automationId,
    },
  });
}

/** The Costs tab: what was spent, by project, with AI charged outside any project. */
export async function readCosts(context: ReportReadContext, query: CostsReadQuery) {
  const period = resolvePeriod({ ...query, ...context });
  const costs = await queryCosts({ ...context, ...query, period, includeUnattributed: true });
  return { period, ...costs };
}

export type ReportPayload = {
  activity: Awaited<ReturnType<typeof readActivity>>;
  words: Awaited<ReturnType<typeof readWords>>;
  time: Awaited<ReturnType<typeof readTime>>;
  ai: Awaited<ReturnType<typeof readAi>>;
  costs: Awaited<ReturnType<typeof readCosts>>;
};

/** One report by kind, as its tab shows it. */
export async function readReport<K extends ReportKind>(
  kind: K,
  context: ReportReadContext,
  query: ReportReadQuery[K],
): Promise<ReportPayload[K]> {
  switch (kind) {
    case "activity":
      return (await readActivity(context, query as ActivityReadQuery)) as ReportPayload[K];
    case "words":
      return (await readWords(context, query as WordsReadQuery)) as ReportPayload[K];
    case "time":
      return (await readTime(context, query as TimeReadQuery)) as ReportPayload[K];
    case "ai":
      return (await readAi(context, query as AiReadQuery)) as ReportPayload[K];
    default:
      return (await readCosts(context, query as CostsReadQuery)) as ReportPayload[K];
  }
}

export type SummaryFreshness = {
  /** Days of recent work the summary has not counted yet. */
  pendingDays: number;
  oldestMarkedAt: string | null;
};

/** Whether recent work is still being added to the summary a reader is about to see. */
export async function summaryFreshness(organizationId: string): Promise<SummaryFreshness> {
  const pending = await db.execute<SummaryFreshness>(sql`
    select count(*)::integer as "pendingDays", min(marked_at)::text as "oldestMarkedAt"
    from reporting_summary_queue where organization_id = ${organizationId}
  `);
  return pending.rows[0] ?? { pendingDays: 0, oldestMarkedAt: null };
}
