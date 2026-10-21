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
import { Hono, type Context } from "hono";
import { and, eq, inArray, desc, sql } from "drizzle-orm";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { hasCapability } from "@/api/auth/policy";
import { getAccessibleProjectIds, buildAccessibleJobsWhere } from "@/api/auth/team-access";
import { createWorkspaceFeatureFlagMiddleware } from "@/api/middleware/workspace-feature-flag";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  notFoundResponse,
} from "@/api/response.schema";
import { isErr } from "@/lib/primitives/result/results";
import { db, schema } from "@/lib/database/client";
import { workspaceReportsFlag } from "@/lib/flags/workspace-flags";
import { queryReport, reportCsv } from "@/lib/reporting/query";
import { hourlyCost } from "@/lib/reporting/money";
import { resolveReportingRate, reportingStart } from "@/lib/reporting/capture";
import { budgetSummary } from "@/lib/reporting/budgets";
import { queryAiUsage } from "@/lib/reporting/ai-usage";
import {
  queryBudgets,
  queryCostEstimate,
  queryCosts,
  queryStillToCome,
} from "@/lib/reporting/cost-queries";
import {
  isLiveRateLine,
  listRateCards,
  rateCardExists,
  saveRateCard,
} from "@/lib/reporting/rate-cards";
import {
  aiUsageCsv,
  budgetsCsv,
  costEstimateCsv,
  costsCsv,
  loggedTimeCsv,
  stepTimesCsv,
  wordCountsCsv,
} from "@/lib/reporting/report-csv";
import { resolvePeriod } from "@/lib/reporting/report-period";
import { getReportingStart } from "@/lib/reporting/reporting-start";
import {
  queryAutomatedTime,
  queryLoggedTime,
  queryLoggedTimeBySteps,
} from "@/lib/reporting/time-queries";
import {
  queryActivity,
  queryFinishedByLanguage,
  queryFinishedSeries,
  queryTaskWords,
  queryWordCounts,
} from "@/lib/reporting/word-queries";
import {
  listReportJobs,
  matchAnalysisCsv,
  queryJobMatchAnalysis,
  queryWordVolume,
  wordVolumeCsv,
} from "@/lib/reporting/word-count-report";
import {
  reportQuerySchema,
  wordCountQuerySchema,
  exportFormatSchema,
  reportTaskSearchSchema,
  activityQuerySchema,
  stepTimesQuerySchema,
  aiUsageQuerySchema,
  wordsQuerySchema,
  loggedTimeQuerySchema,
  costsQuerySchema,
  costEstimateQuerySchema,
  taskReportQuerySchema,
  rateCardSchema,
  rateSchema,
  budgetSchema,
  taskRateSchema,
  timeSchema,
  timeUpdateSchema,
  expenseSchema,
} from "./reports.schema";

type ReportsContext = Context<{ Variables: AuthVariables }>;

/** The viewer's workspace, projects and money access, and the dates Reports can cover. */
async function reportContext(c: ReportsContext) {
  const organizationId = c.var.auth.organization.localOrganizationId;
  const [projectIds, startedAt] = await Promise.all([
    getAccessibleProjectIds(c.var.auth),
    getReportingStart(organizationId),
  ]);
  return {
    organizationId,
    projectIds,
    startedAt,
    startedDay: startedAt ? startedAt.toISOString().slice(0, 10) : null,
    today: new Date().toISOString().slice(0, 10),
    financial: hasCapability(c.var.auth.membership.role, "billing:read"),
  };
}

function csv(c: ReportsContext, filename: string, body: string) {
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${filename}"`);
  return c.body(body);
}

export function createReportsRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .use(
      "*",
      createWorkspaceFeatureFlagMiddleware(
        workspaceReportsFlag,
        "Reports is not enabled for this workspace",
      ),
    )
    .get("/", async (c) => {
      const parsed = reportQuerySchema.safeParse(c.req.query());
      if (!parsed.success) return badRequestResponse(c, "invalid_report_query");
      const financial = hasCapability(c.var.auth.membership.role, "billing:read");
      if (parsed.data.view === "costs" && !financial)
        return forbiddenResponse(c, "report_costs_forbidden");
      const report = await queryReport({
        organizationId: c.var.auth.organization.localOrganizationId,
        projectIds: await getAccessibleProjectIds(c.var.auth),
        financial,
        query: parsed.data,
      });
      if (parsed.data.format === "csv") {
        c.header("Content-Type", "text/csv; charset=utf-8");
        c.header("Content-Disposition", 'attachment; filename="translation-report.csv"');
        return c.body(reportCsv(report.rows, financial));
      }
      return c.json({ report });
    })
    .get("/word-counts", async (c) => {
      const parsed = wordCountQuerySchema.safeParse(c.req.query());
      if (!parsed.success) return badRequestResponse(c, "invalid_report_query");
      const today = new Date().toISOString().slice(0, 10);
      const from =
        parsed.data.from ?? new Date(Date.now() - 27 * 86400000).toISOString().slice(0, 10);
      const to = parsed.data.to ?? today;
      const rows = await queryWordVolume({
        organizationId: c.var.auth.organization.localOrganizationId,
        projectIds: await getAccessibleProjectIds(c.var.auth),
        from,
        to,
        groupBy: parsed.data.groupBy,
        projectId: parsed.data.projectId,
        jobId: parsed.data.jobId,
        targetLocale: parsed.data.targetLocale,
        step: parsed.data.step,
      });
      if (parsed.data.format === "csv") {
        c.header("Content-Type", "text/csv; charset=utf-8");
        c.header("Content-Disposition", 'attachment; filename="word-counts.csv"');
        return c.body(wordVolumeCsv(rows, parsed.data.groupBy));
      }
      return c.json({ wordCounts: { rows, from, to, groupBy: parsed.data.groupBy } });
    })
    .get("/jobs", async (c) => {
      const parsed = reportTaskSearchSchema.safeParse(c.req.query());
      if (!parsed.success) return badRequestResponse(c, "invalid_report_query");
      const jobs = await listReportJobs({
        organizationId: c.var.auth.organization.localOrganizationId,
        projectIds: await getAccessibleProjectIds(c.var.auth),
        ...parsed.data,
      });
      return c.json({ jobs });
    })
    .get("/settings", async (c) => {
      const context = await reportContext(c);
      const { organizationId, projectIds } = context;
      const role = c.var.auth.membership.role;
      const [projects, pending] = await Promise.all([
        projectIds.length
          ? db
              .select({
                id: schema.projects.id,
                name: schema.projects.name,
                sourceLocale: schema.projects.sourceLocale,
                targetLocales: schema.projects.targetLocales,
              })
              .from(schema.projects)
              .where(inArray(schema.projects.id, projectIds))
          : [],
        db.execute<{ days: number; oldestMarkedAt: string | null }>(sql`
          select count(*)::integer as days, min(marked_at) as "oldestMarkedAt"
          from reporting_summary_queue where organization_id = ${organizationId}
        `),
      ]);
      const shared = {
        projects,
        startedAt: context.startedAt?.toISOString() ?? null,
        startedDay: context.startedDay,
        today: context.today,
        canLogTime: hasCapability(role, "jobs:write"),
        // Days of recent work the summary has not counted yet.
        summary: {
          pendingDays: pending.rows[0].days,
          oldestMarkedAt: pending.rows[0].oldestMarkedAt,
        },
      };
      if (!context.financial)
        return c.json({
          settings: {
            ...shared,
            rates: [],
            budgets: [],
            rateCardNames: [],
            financial: false,
            canManage: false,
          },
        });
      const [rates, budgets, rateCards] = await Promise.all([
        db
          .select()
          .from(schema.reportingRates)
          .where(eq(schema.reportingRates.organizationId, organizationId))
          .orderBy(desc(schema.reportingRates.createdAt)),
        budgetSummary(organizationId, projectIds),
        listRateCards(organizationId),
      ]);
      return c.json({
        settings: {
          ...shared,
          rates,
          budgets,
          rateCardNames: rateCards.map((card) => card.name),
          financial: true,
          canManage: hasCapability(role, "billing:write"),
        },
      });
    })
    .get("/activity", async (c) => {
      const parsed = activityQuerySchema.safeParse(c.req.query());
      if (!parsed.success) return badRequestResponse(c, "invalid_report_query");
      const context = await reportContext(c);
      const period = resolvePeriod({ ...parsed.data, ...context });
      const { jobId, ...filters } = parsed.data;
      const scope = { ...context, ...filters, jobIds: jobId ? [jobId] : undefined, period };
      const [totals, series, byLanguage] = await Promise.all([
        queryActivity(scope),
        queryFinishedSeries({ ...scope, step: "translation" }),
        queryFinishedByLanguage({ ...scope, step: "translation" }),
      ]);
      return c.json({
        activity: { period, unit: parsed.data.unit, ...totals, series, byLanguage },
      });
    })
    .get("/step-times", async (c) => {
      const parsed = stepTimesQuerySchema.safeParse(c.req.query());
      if (!parsed.success) return badRequestResponse(c, "invalid_report_query");
      const context = await reportContext(c);
      const period = resolvePeriod({ ...parsed.data, ...context });
      const { jobId, ...filters } = parsed.data;
      const [logged, automated] = await Promise.all([
        queryLoggedTimeBySteps({
          ...context,
          ...filters,
          jobIds: jobId ? [jobId] : undefined,
          period,
        }),
        queryAutomatedTime({
          ...context,
          projectId: filters.projectId,
          period,
          includeUnattributed: context.financial,
        }),
      ]);
      if (parsed.data.format === "csv")
        return csv(c, "step-times.csv", stepTimesCsv(logged, automated));
      return c.json({ stepTimes: { period, logged, automated } });
    })
    .get("/ai-usage", async (c) => {
      const parsed = aiUsageQuerySchema.safeParse(c.req.query());
      if (!parsed.success) return badRequestResponse(c, "invalid_report_query");
      const context = await reportContext(c);
      const period = resolvePeriod({ ...parsed.data, ...context });
      const usage = await queryAiUsage({
        ...context,
        projectId: parsed.data.projectId,
        period,
        // AI used outside any project (chat, assistants, workspace automations) is workspace
        // spending, shown to the roles that see billing.
        includeUnattributed: context.financial,
      });
      if (parsed.data.format === "csv")
        return csv(c, "ai-usage.csv", aiUsageCsv(usage, parsed.data.groupBy));
      return c.json({ aiUsage: { period, ...usage } });
    })
    .get("/words", async (c) => {
      const parsed = wordsQuerySchema.safeParse(c.req.query());
      if (!parsed.success) return badRequestResponse(c, "invalid_report_query");
      const context = await reportContext(c);
      const period = resolvePeriod({ ...parsed.data, ...context });
      const { jobId, format, ...filters } = parsed.data;
      const counts = await queryWordCounts({
        ...context,
        ...filters,
        jobIds: jobId ? [jobId] : undefined,
        period,
        all: format === "csv",
      });
      if (format === "csv")
        return csv(c, "word-counts.csv", wordCountsCsv(counts, parsed.data.groupBy));
      return c.json({
        wordCounts: {
          period,
          unit: filters.unit,
          step: filters.step,
          mode: filters.mode,
          groupBy: filters.groupBy,
          ...counts,
        },
      });
    })
    .get("/time", async (c) => {
      const parsed = loggedTimeQuerySchema.safeParse(c.req.query());
      if (!parsed.success) return badRequestResponse(c, "invalid_report_query");
      const context = await reportContext(c);
      const period = resolvePeriod({ ...parsed.data, ...context });
      const { jobId, format, ...filters } = parsed.data;
      const [logged, automated] = await Promise.all([
        queryLoggedTime({
          ...context,
          ...filters,
          jobIds: jobId ? [jobId] : undefined,
          period,
          all: format === "csv",
        }),
        queryAutomatedTime({
          ...context,
          projectId: filters.projectId,
          period,
          includeUnattributed: context.financial,
        }),
      ]);
      if (format === "csv") return csv(c, "time.csv", loggedTimeCsv(logged));
      return c.json({ time: { period, logged, automated } });
    })
    .get("/costs", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "billing:read"))
        return forbiddenResponse(c, "report_costs_forbidden");
      const parsed = costsQuerySchema.safeParse(c.req.query());
      if (!parsed.success) return badRequestResponse(c, "invalid_report_query");
      const context = await reportContext(c);
      const period = resolvePeriod({ ...parsed.data, ...context });
      const costs = await queryCosts({ ...context, ...parsed.data, period });
      if (parsed.data.format === "csv") return csv(c, "costs.csv", costsCsv(costs));
      return c.json({ costs: { period, ...costs } });
    })
    .get("/cost-estimate", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "billing:read"))
        return forbiddenResponse(c, "report_costs_forbidden");
      const parsed = costEstimateQuerySchema.safeParse(c.req.query());
      if (!parsed.success) return badRequestResponse(c, "invalid_report_query");
      const context = await reportContext(c);
      const { rateCard, format, ...filters } = parsed.data;
      const estimate = await queryCostEstimate({
        ...context,
        ...filters,
        rateCardName: rateCard ?? null,
      });
      if (format === "csv") return csv(c, "cost-estimate.csv", costEstimateCsv(estimate));
      return c.json({ costEstimate: estimate });
    })
    .get("/budgets", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "billing:read"))
        return forbiddenResponse(c, "report_costs_forbidden");
      const parsed = exportFormatSchema.safeParse(c.req.query());
      if (!parsed.success) return badRequestResponse(c, "invalid_report_query");
      const context = await reportContext(c);
      const budgets = await queryBudgets(context);
      if (parsed.data.format === "csv") return csv(c, "budgets.csv", budgetsCsv(budgets));
      return c.json({ budgets });
    })
    .get("/rate-cards", async (c) => {
      const role = c.var.auth.membership.role;
      if (!hasCapability(role, "billing:read"))
        return forbiddenResponse(c, "report_costs_forbidden");
      const rateCards = await listRateCards(c.var.auth.organization.localOrganizationId);
      return c.json({ rateCards, canManage: hasCapability(role, "billing:write") });
    })
    .put("/rate-cards", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "billing:write"))
        return forbiddenResponse(c, "report_costs_forbidden");
      const parsed = rateCardSchema.safeParse(await c.req.json());
      if (!parsed.success) return badRequestResponse(c, "invalid_rate_card");
      const saved = await saveRateCard({
        ...parsed.data,
        organizationId: c.var.auth.organization.localOrganizationId,
        actorId: c.var.auth.user.localUserId,
      });
      if (isErr(saved)) {
        if (saved.error.code === "rate_card_exists")
          return conflictResponse(c, "rate_card_exists", "A rate card with this name exists.");
        if (saved.error.code === "rate_card_not_found")
          return notFoundResponse(c, "rate_card_not_found");
        return badRequestResponse(
          c,
          "duplicate_rate_line",
          "Each language pair and step can have one rate on a card.",
        );
      }
      return c.json({ rateCard: saved.value });
    })
    .get("/tasks/:jobId/report", async (c) => {
      const parsed = taskReportQuerySchema.safeParse(c.req.query());
      if (!parsed.success) return badRequestResponse(c, "invalid_report_query");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const [job] = await db
        .select()
        .from(schema.jobs)
        .where(
          and(eq(schema.jobs.id, c.req.param("jobId")), await buildAccessibleJobsWhere(c.var.auth)),
        );
      if (!job) return notFoundResponse(c, "job_not_found");
      const role = c.var.auth.membership.role;
      const financial = hasCapability(role, "billing:read");
      const userId = c.var.auth.user.localUserId;
      const money = financial && job.projectId;
      const [words, entries, estimate, stillToCome] = await Promise.all([
        queryTaskWords({ organizationId, jobId: job.id, unit: parsed.data.unit }),
        db.execute<{
          id: string;
          contributorId: string;
          person: string | null;
          step: string;
          targetLocale: string;
          workDate: string;
          minutes: number;
          note: string | null;
        }>(sql`
          select e.id, e.contributor_id as "contributorId",
            coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email) as person,
            e.step, e.target_locale as "targetLocale", e.work_date as "workDate", e.minutes, e.note
          from reporting_time_entries e left join users u on u.id = e.contributor_id
          where e.organization_id = ${organizationId} and e.job_id = ${job.id} and not e.voided
          order by e.work_date desc, e.created_at desc
        `),
        money
          ? queryCostEstimate({
              organizationId,
              projectIds: [job.projectId!],
              jobIds: [job.id],
              step: parsed.data.step,
              unit: parsed.data.unit,
              rateCardName: parsed.data.rateCard ?? null,
            })
          : null,
        money
          ? queryStillToCome({
              organizationId,
              projectIds: [job.projectId!],
              jobIds: [job.id],
              step: parsed.data.step,
              rateCardName: parsed.data.rateCard ?? null,
            })
          : null,
      ]);
      const payload = job.inputPayload as {
        sourceLocale?: string;
        targetLocales?: string[];
        targetLocale?: string;
        metadata?: { title?: string };
      };
      const canEditAll = hasCapability(role, "billing:write");
      const canLog = hasCapability(role, "jobs:write");
      return c.json({
        taskReport: {
          task: {
            id: job.id,
            title: payload.metadata?.title ?? job.id,
            kind: job.kind,
            status: job.status,
            projectId: job.projectId,
            createdAt: job.createdAt.toISOString(),
            sourceLocale: payload.sourceLocale ?? null,
            targetLocales:
              payload.targetLocales ?? (payload.targetLocale ? [payload.targetLocale] : []),
          },
          unit: parsed.data.unit,
          step: parsed.data.step,
          words,
          estimate,
          stillToCome: stillToCome
            ? (stillToCome.get(job.projectId!) ?? { amountUsd: "0.00000000", incomplete: false })
            : null,
          time: {
            minutes: entries.rows.reduce((sum, entry) => sum + entry.minutes, 0),
            people: new Set(entries.rows.map((entry) => entry.contributorId)).size,
            // Other people's entries are shown to the roles that see what work costs.
            entries: entries.rows
              .filter((entry) => financial || entry.contributorId === userId)
              .map(({ contributorId, ...entry }) => ({
                ...entry,
                own: contributorId === userId,
                canEdit: canLog && (contributorId === userId || canEditAll),
              })),
          },
          canLogTime: canLog,
        },
      });
    })
    .get("/tasks/:jobId/match-analysis", async (c) => {
      const parsed = exportFormatSchema.safeParse(c.req.query());
      if (!parsed.success) return badRequestResponse(c, "invalid_report_query");
      const [job] = await db
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(
          and(eq(schema.jobs.id, c.req.param("jobId")), await buildAccessibleJobsWhere(c.var.auth)),
        );
      if (!job) return notFoundResponse(c, "job_not_found");
      const rows = await queryJobMatchAnalysis({
        organizationId: c.var.auth.organization.localOrganizationId,
        jobId: job.id,
      });
      if (parsed.data.format === "csv") {
        c.header("Content-Type", "text/csv; charset=utf-8");
        c.header("Content-Disposition", 'attachment; filename="match-analysis.csv"');
        return c.body(matchAnalysisCsv(rows));
      }
      return c.json({ matchAnalysis: { jobId: job.id, rows } });
    })
    .get("/tasks/:jobId", async (c) => {
      const organizationId = c.var.auth.organization.localOrganizationId;
      const [job] = await db
        .select()
        .from(schema.jobs)
        .where(
          and(eq(schema.jobs.id, c.req.param("jobId")), await buildAccessibleJobsWhere(c.var.auth)),
        );
      if (!job) return notFoundResponse(c, "job_not_found");
      const analyses = await db
        .select({
          id: schema.reportingAnalyses.id,
          segmentId: schema.reportingAnalyses.segmentId,
          sourceRevision: schema.reportingAnalyses.sourceRevision,
          targetLocale: schema.reportingAnalyses.targetLocale,
          words: schema.reportingAnalyses.words,
          bucket: schema.reportingAnalyses.bucket,
          matchScore: schema.reportingAnalyses.matchScore,
          createdAt: schema.reportingAnalyses.createdAt,
        })
        .from(schema.reportingAnalyses)
        .where(
          and(
            eq(schema.reportingAnalyses.organizationId, organizationId),
            eq(schema.reportingAnalyses.jobId, job.id),
            // Earlier versions of a re-saved or re-analysed string are history, not workload.
            eq(schema.reportingAnalyses.isCurrent, true),
          ),
        );
      const times = await db
        .select()
        .from(schema.reportingTimeEntries)
        .where(
          and(
            eq(schema.reportingTimeEntries.organizationId, organizationId),
            eq(schema.reportingTimeEntries.jobId, job.id),
            eq(schema.reportingTimeEntries.voided, false),
          ),
        );
      const financial = hasCapability(c.var.auth.membership.role, "billing:read");
      return c.json({
        taskReport: {
          analyses,
          timeEntries: times
            .filter((entry) => financial || entry.contributorId === c.var.auth.user.localUserId)
            .map(({ rateId: _rateId, ...entry }) => entry),
        },
      });
    })
    .post("/rates", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "billing:write"))
        return forbiddenResponse(c, "report_costs_forbidden");
      const parsed = rateSchema.safeParse(await c.req.json());
      if (!parsed.success) return badRequestResponse(c, "invalid_rate");
      const [rate] = await db
        .insert(schema.reportingRates)
        .values({ ...parsed.data, organizationId: c.var.auth.organization.localOrganizationId })
        .returning();
      return c.json({ rate }, 201);
    })
    .put("/budgets", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "billing:write"))
        return forbiddenResponse(c, "report_costs_forbidden");
      const parsed = budgetSchema.safeParse(await c.req.json());
      if (!parsed.success) return badRequestResponse(c, "invalid_budget");
      if (!(await getAccessibleProjectIds(c.var.auth)).includes(parsed.data.projectId))
        return notFoundResponse(c, "project_not_found");
      if (
        parsed.data.rateCardName &&
        !(await rateCardExists(
          c.var.auth.organization.localOrganizationId,
          parsed.data.rateCardName,
        ))
      )
        return badRequestResponse(c, "rate_card_not_found");
      const [budget] = await db
        .insert(schema.reportingBudgets)
        .values({ ...parsed.data, organizationId: c.var.auth.organization.localOrganizationId })
        .onConflictDoUpdate({
          target: [schema.reportingBudgets.organizationId, schema.reportingBudgets.projectId],
          set: parsed.data,
        })
        .returning();
      return c.json({ budget });
    })
    .put("/task-rates", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "billing:write"))
        return forbiddenResponse(c, "report_costs_forbidden");
      const parsed = taskRateSchema.safeParse(await c.req.json());
      if (!parsed.success) return badRequestResponse(c, "invalid_task_rate");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const [job] = await db
        .select()
        .from(schema.jobs)
        .where(
          and(eq(schema.jobs.id, parsed.data.jobId), await buildAccessibleJobsWhere(c.var.auth)),
        );
      if (!job) return notFoundResponse(c, "job_not_found");
      if (parsed.data.rateId) {
        const [rate] = await db
          .select()
          .from(schema.reportingRates)
          .where(
            and(
              eq(schema.reportingRates.id, parsed.data.rateId),
              eq(schema.reportingRates.organizationId, organizationId),
              eq(schema.reportingRates.step, parsed.data.step),
            ),
          );
        // An older version of a line, or one taken off its card, is no longer a rate to choose.
        if (!rate || !(await isLiveRateLine(organizationId, rate.id)))
          return badRequestResponse(c, "invalid_rate");
      }
      const taskRate = await db.transaction(async (tx) => {
        const [lockedJob] = await tx
          .select()
          .from(schema.jobs)
          .where(eq(schema.jobs.id, job.id))
          .for("update");
        const activity = await tx.execute<{ started: boolean }>(sql`
          select exists(select 1 from reporting_analyses where job_id=${job.id} and step=${parsed.data.step})
            or exists(select 1 from reporting_costs where job_id=${job.id} and step=${parsed.data.step})
            or exists(select 1 from reporting_time_entries where job_id=${job.id} and step=${parsed.data.step}) as started
        `);
        if (lockedJob.status !== "queued" || activity.rows[0].started) return null;
        const [saved] = await tx
          .insert(schema.reportingTaskRates)
          .values({ ...parsed.data, organizationId })
          .onConflictDoUpdate({
            target: [
              schema.reportingTaskRates.organizationId,
              schema.reportingTaskRates.jobId,
              schema.reportingTaskRates.step,
            ],
            set: parsed.data,
          })
          .returning();
        await tx.insert(schema.reportingAudit).values({
          organizationId,
          actorId: c.var.auth.user.localUserId,
          resourceId: saved.id,
          action: "task_rate_saved",
          after: saved,
        });
        return saved;
      });
      if (!taskRate)
        return badRequestResponse(
          c,
          "task_rate_locked",
          "Task rates can only change before work starts.",
        );
      return c.json({ taskRate });
    })
    .post("/time-entries", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:write"))
        return forbiddenResponse(c, "time_entry_forbidden");
      const parsed = timeSchema.safeParse(await c.req.json());
      if (!parsed.success) return badRequestResponse(c, "invalid_time_entry");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const [job] = await db
        .select()
        .from(schema.jobs)
        .where(
          and(eq(schema.jobs.id, parsed.data.jobId), await buildAccessibleJobsWhere(c.var.auth)),
        );
      if (!job?.projectId) return notFoundResponse(c, "job_not_found");
      const [external] = await db
        .select()
        .from(schema.externalJobDetails)
        .where(eq(schema.externalJobDetails.jobId, job.id));
      if (external) return badRequestResponse(c, "native_job_required");
      const [project] = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, job.projectId));
      const payload = job.inputPayload as {
        sourceLocale?: string;
        targetLocales?: string[];
        targetLocale?: string;
      };
      const rate = await resolveReportingRate({
        organizationId,
        projectId: job.projectId,
        jobId: job.id,
        sourceLocale: payload.sourceLocale ?? project.sourceLocale ?? "en",
        targetLocale: parsed.data.targetLocale,
        step: parsed.data.step,
      });
      const timeEntry = await db.transaction(async (tx) => {
        await tx
          .select({ id: schema.jobs.id })
          .from(schema.jobs)
          .where(eq(schema.jobs.id, job.id))
          .for("update");
        const [taskRate] = await tx
          .select()
          .from(schema.reportingTaskRates)
          .where(
            and(
              eq(schema.reportingTaskRates.jobId, job.id),
              eq(schema.reportingTaskRates.step, parsed.data.step),
            ),
          );
        const [entry] = await tx
          .insert(schema.reportingTimeEntries)
          .values({
            ...parsed.data,
            workDate: new Date(parsed.data.workDate + "T00:00:00Z"),
            organizationId,
            projectId: job.projectId!,
            contributorId: c.var.auth.user.localUserId,
            rateId: rate?.id,
          })
          .returning();
        // Logged time is priced only by an hourly rate; per-unit rates price finished work.
        if ((!rate || rate.basis === "hour") && taskRate?.overrideUsd == null)
          await tx.insert(schema.reportingCosts).values({
            organizationId,
            projectId: job.projectId,
            jobId: job.id,
            operationKey: `time:${entry.id}`,
            kind: "human",
            step: entry.step,
            timeEntryId: entry.id,
            targetLocale: entry.targetLocale,
            rateId: rate?.id,
            amountUsd: rate ? hourlyCost(rate.rate, entry.minutes) : null,
            basis: rate ? "rate" : "unpriced",
            createdAt: entry.workDate,
          });
        await tx.insert(schema.reportingAudit).values({
          organizationId,
          actorId: c.var.auth.user.localUserId,
          resourceId: entry.id,
          action: "time_created",
          after: entry,
        });
        return entry;
      });
      await reportingStart(organizationId);
      return c.json({ timeEntry: { id: timeEntry.id } }, 201);
    })
    .patch("/time-entries/:id", async (c) => {
      const parsed = timeUpdateSchema.safeParse(await c.req.json());
      if (!parsed.success) return badRequestResponse(c, "invalid_time_entry");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const [entry] = await db
        .select()
        .from(schema.reportingTimeEntries)
        .where(
          and(
            eq(schema.reportingTimeEntries.organizationId, organizationId),
            eq(schema.reportingTimeEntries.id, c.req.param("id")),
            eq(schema.reportingTimeEntries.voided, false),
          ),
        );
      if (
        !entry?.projectId ||
        !(await getAccessibleProjectIds(c.var.auth)).includes(entry.projectId)
      )
        return notFoundResponse(c, "time_entry_not_found");
      if (
        !hasCapability(c.var.auth.membership.role, "jobs:write") ||
        (entry.contributorId !== c.var.auth.user.localUserId &&
          !hasCapability(c.var.auth.membership.role, "billing:write"))
      )
        return forbiddenResponse(c, "time_entry_forbidden");
      await db.transaction(async (tx) => {
        const [rate] = entry.rateId
          ? await tx
              .select()
              .from(schema.reportingRates)
              .where(eq(schema.reportingRates.id, entry.rateId))
          : [];
        const workDate = new Date(parsed.data.workDate + "T00:00:00Z");
        await tx
          .update(schema.reportingTimeEntries)
          .set({ ...parsed.data, workDate })
          .where(eq(schema.reportingTimeEntries.id, entry.id));
        if (!rate || rate.basis === "hour")
          await tx
            .update(schema.reportingCosts)
            .set({
              amountUsd: rate ? hourlyCost(rate.rate, parsed.data.minutes) : null,
              createdAt: workDate,
            })
            .where(eq(schema.reportingCosts.timeEntryId, entry.id));
        await tx.insert(schema.reportingAudit).values({
          organizationId,
          actorId: c.var.auth.user.localUserId,
          resourceId: entry.id,
          action: "time_updated",
          before: entry,
          after: parsed.data,
        });
      });
      return c.json({ timeEntry: { id: entry.id } });
    })
    .delete("/time-entries/:id", async (c) => {
      const organizationId = c.var.auth.organization.localOrganizationId;
      const [entry] = await db
        .select()
        .from(schema.reportingTimeEntries)
        .where(
          and(
            eq(schema.reportingTimeEntries.organizationId, organizationId),
            eq(schema.reportingTimeEntries.id, c.req.param("id")),
          ),
        );
      if (
        !entry?.projectId ||
        !(await getAccessibleProjectIds(c.var.auth)).includes(entry.projectId)
      )
        return notFoundResponse(c, "time_entry_not_found");
      if (
        entry.contributorId !== c.var.auth.user.localUserId &&
        !hasCapability(c.var.auth.membership.role, "billing:write")
      )
        return forbiddenResponse(c, "time_entry_forbidden");
      await db.transaction(async (tx) => {
        await tx
          .update(schema.reportingTimeEntries)
          .set({ voided: true })
          .where(eq(schema.reportingTimeEntries.id, entry.id));
        await tx
          .update(schema.reportingCosts)
          .set({ voided: true })
          .where(eq(schema.reportingCosts.timeEntryId, entry.id));
        await tx.insert(schema.reportingAudit).values({
          organizationId,
          actorId: c.var.auth.user.localUserId,
          resourceId: entry.id,
          action: "time_voided",
          before: entry,
        });
      });
      return c.body(null, 204);
    })
    .post("/expenses", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "billing:write"))
        return forbiddenResponse(c, "report_costs_forbidden");
      const parsed = expenseSchema.safeParse(await c.req.json());
      if (!parsed.success) return badRequestResponse(c, "invalid_expense");
      const organizationId = c.var.auth.organization.localOrganizationId;
      if (!(await getAccessibleProjectIds(c.var.auth)).includes(parsed.data.projectId))
        return notFoundResponse(c, "project_not_found");
      if (parsed.data.jobId) {
        const [job] = await db
          .select()
          .from(schema.jobs)
          .where(
            and(
              eq(schema.jobs.id, parsed.data.jobId),
              eq(schema.jobs.projectId, parsed.data.projectId),
              eq(schema.jobs.organizationId, organizationId),
            ),
          );
        if (!job) return notFoundResponse(c, "job_not_found");
      }
      const [expense] = await db
        .insert(schema.reportingCosts)
        .values({ ...parsed.data, organizationId, kind: "expense", basis: "manual" })
        .onConflictDoNothing()
        .returning();
      return c.json({ expense: expense ?? null }, 201);
    });
}
