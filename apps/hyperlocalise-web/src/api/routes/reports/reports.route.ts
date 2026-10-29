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
// Kept for one release after the Reports page moved to go-svc (`apps/go-svc/reporting*.go`), so
// an open tab and a rollback keep working. Nothing calls these routes: change Reports in go-svc.
// `reports.schema.ts` still checks the MCP `get_report` tool's input, so a query field added in
// go-svc is added there too, and the schemas outlive these routes.
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { validator } from "hono/validator";
import type { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
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
import { hourlyCost } from "@/lib/reporting/money";
import { resolveReportingRate, reportingStart } from "@/lib/reporting/capture";
import { queryBudgets, queryCostEstimate, queryStillToCome } from "@/lib/reporting/cost-queries";
import {
  lockRateCard,
  listRateCards,
  rateCardExists,
  saveRateCard,
} from "@/lib/reporting/rate-cards";
import {
  activityCsv,
  aiUsageCsv,
  budgetsCsv,
  costEstimateCsv,
  costsCsv,
  loggedTimeCsv,
  stepTimesCsv,
  taskWordsCsv,
  wordCountsCsv,
} from "@/lib/reporting/report-csv";
import { resolvePeriod } from "@/lib/reporting/report-period";
import {
  readActivity,
  readAi,
  readCosts,
  readTime,
  readWordReport,
  readWords,
  readWordSeries,
  summaryFreshness,
} from "@/lib/reporting/report-reads";
import { scopedProjectIds } from "@/lib/reporting/report-scope";
import { REPORT_STEPS } from "@/lib/reporting/report-units";
import { readTaskAnalysis } from "@/lib/reporting/task-analysis-status";
import { lockedPricingSteps } from "@/lib/reporting/task-pricing";
import { getReportingStart } from "@/lib/reporting/reporting-start";
import { queryAutomatedTime, queryLoggedTimeBySteps } from "@/lib/reporting/time-queries";
import { queryTaskWords } from "@/lib/reporting/word-queries";
import { listReportJobs } from "@/lib/reporting/word-count-report";
import {
  reportKindSchema,
  budgetsQuerySchema,
  reportTaskSearchSchema,
  activityQuerySchema,
  stepTimesQuerySchema,
  aiUsageQuerySchema,
  wordReportQuerySchema,
  wordSeriesQuerySchema,
  wordsQuerySchema,
  loggedTimeQuerySchema,
  costsQuerySchema,
  costEstimateQuerySchema,
  taskReportQuerySchema,
  rateCardSchema,
  budgetSchema,
  taskRateSchema,
  timeSchema,
  timeUpdateSchema,
} from "./reports.schema";

/** A query string as the typed API client sends it: every parameter optional, as text. */
type QueryInput<T extends z.ZodType> = { [K in keyof z.input<T>]?: string };

/** Validates a report's query string, so the typed API client knows its parameters. */
function reportQuery<T extends z.ZodType>(schema: T) {
  return validator("query", (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) return badRequestResponse(c, "invalid_report_query");
    return parsed.data;
  }) as unknown as MiddlewareHandler<
    { Variables: AuthVariables },
    string,
    { in: { query: QueryInput<T> }; out: { query: z.output<T> } }
  >;
}

/** Validates a JSON body, so the typed API client knows its shape. */
function reportBody<T extends z.ZodType>(schema: T, code: string) {
  return validator("json", (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) return badRequestResponse(c, code);
    return parsed.data;
  }) as unknown as MiddlewareHandler<
    { Variables: AuthVariables },
    string,
    { in: { json: z.input<T> }; out: { json: z.output<T> } }
  >;
}

/** Refuses a request before its input is read when the viewer's role lacks a capability. */
function requireCapability(capability: Parameters<typeof hasCapability>[1], error: string) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    if (!hasCapability(c.var.auth.membership.role, capability)) return forbiddenResponse(c, error);
    await next();
  });
}

const billingRead = requireCapability("billing:read", "report_costs_forbidden");
const billingWrite = requireCapability("billing:write", "report_costs_forbidden");
const canLogTime = requireCapability("jobs:write", "time_entry_forbidden");

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
    userId: c.var.auth.user.localUserId,
  };
}

/**
 * A CSV download. The page downloads through a plain link, never the typed API client, so this
 * branch is left out of the route's response type and the client sees only the JSON response.
 */
function csv(c: ReportsContext, filename: string, body: string): never {
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${filename}"`);
  return c.body(body) as never;
}

export function createReportsRoutes() {
  return (
    new Hono<{ Variables: AuthVariables }>()
      .use("*", workosAuthMiddleware)
      .use(
        "*",
        createWorkspaceFeatureFlagMiddleware(
          workspaceReportsFlag,
          "Reports is not enabled for this workspace",
        ),
      )
      // The public endpoint: one of the page's reports by kind, with that tab's own fields, and
      // whether recent work is still being counted.
      .get("/", billingRead, async (c) => {
        const kind = reportKindSchema.safeParse(c.req.query("report") ?? "activity");
        if (!kind.success) return badRequestResponse(c, "invalid_report_kind");
        const context = await reportContext(c);
        const summary = await summaryFreshness(context.organizationId);
        switch (kind.data) {
          case "activity": {
            const query = activityQuerySchema.safeParse(c.req.query());
            if (!query.success) return badRequestResponse(c, "invalid_report_query");
            const activity = await readActivity(context, query.data);
            if (query.data.format === "csv") return csv(c, "activity.csv", activityCsv(activity));
            return c.json({ report: { kind: "activity" as const, activity, summary } });
          }
          case "words": {
            const query = wordReportQuerySchema.safeParse(c.req.query());
            if (!query.success) return badRequestResponse(c, "invalid_report_query");
            const { format, ...rest } = query.data;
            if (format === "csv")
              return csv(
                c,
                "word-counts.csv",
                wordCountsCsv(await readWords(context, { ...rest, all: true }), rest.groupBy),
              );
            const wordCounts = await readWordReport(context, rest);
            return c.json({ report: { kind: "words" as const, wordCounts, summary } });
          }
          case "time": {
            const query = loggedTimeQuerySchema.safeParse(c.req.query());
            if (!query.success) return badRequestResponse(c, "invalid_report_query");
            const { format, ...rest } = query.data;
            const time = await readTime(context, { ...rest, all: format === "csv" });
            if (format === "csv") return csv(c, "time.csv", loggedTimeCsv(time.logged));
            return c.json({ report: { kind: "time" as const, time, summary } });
          }
          case "ai": {
            const query = aiUsageQuerySchema.safeParse(c.req.query());
            if (!query.success) return badRequestResponse(c, "invalid_report_query");
            const { format, ...rest } = query.data;
            const aiUsage = await readAi(context, { ...rest, all: format === "csv" });
            if (format === "csv") return csv(c, "ai-usage.csv", aiUsageCsv(aiUsage));
            return c.json({ report: { kind: "ai" as const, aiUsage, summary } });
          }
          default: {
            const query = costsQuerySchema.safeParse(c.req.query());
            if (!query.success) return badRequestResponse(c, "invalid_report_query");
            const costs = await readCosts(context, query.data);
            if (query.data.format === "csv") return csv(c, "costs.csv", costsCsv(costs));
            return c.json({ report: { kind: "costs" as const, costs, summary } });
          }
        }
      })
      .get("/jobs", reportQuery(reportTaskSearchSchema), async (c) => {
        const query = c.req.valid("query");
        const jobs = await listReportJobs({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectIds: await getAccessibleProjectIds(c.var.auth),
          ...query,
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
          summaryFreshness(organizationId),
        ]);
        const shared = {
          projects,
          startedAt: context.startedAt?.toISOString() ?? null,
          startedDay: context.startedDay,
          today: context.today,
          canLogTime: hasCapability(role, "jobs:write"),
          // Days of recent work the summary has not counted yet.
          summary: pending,
        };
        if (!context.financial)
          return c.json({
            settings: { ...shared, rateCardNames: [], financial: false, canManage: false },
          });
        const rateCards = await listRateCards(organizationId);
        return c.json({
          settings: {
            ...shared,
            rateCardNames: rateCards.map((card) => card.name),
            financial: true,
            canManage: hasCapability(role, "billing:write"),
          },
        });
      })
      .get("/activity", billingRead, reportQuery(activityQuerySchema), async (c) => {
        const query = c.req.valid("query");
        const activity = await readActivity(await reportContext(c), query);
        if (query.format === "csv") return csv(c, "activity.csv", activityCsv(activity));
        return c.json({ activity });
      })
      .get("/step-times", billingRead, reportQuery(stepTimesQuerySchema), async (c) => {
        const query = c.req.valid("query");
        const context = await reportContext(c);
        const period = resolvePeriod({ ...query, ...context });
        const { jobId, ...filters } = query;
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
            targetLocale: filters.targetLocale,
            period,
            includeUnattributed: context.financial,
          }),
        ]);
        if (query.format === "csv")
          return csv(c, "step-times.csv", stepTimesCsv(logged, automated));
        return c.json({ stepTimes: { period, logged, automated } });
      })
      .get("/ai-usage", billingRead, reportQuery(aiUsageQuerySchema), async (c) => {
        const { format, ...query } = c.req.valid("query");
        const aiUsage = await readAi(await reportContext(c), { ...query, all: format === "csv" });
        if (format === "csv") return csv(c, "ai-usage.csv", aiUsageCsv(aiUsage));
        return c.json({ aiUsage });
      })
      .get("/words/series", billingRead, reportQuery(wordSeriesQuerySchema), async (c) => {
        const wordSeries = await readWordSeries(await reportContext(c), c.req.valid("query"));
        return c.json({ wordSeries });
      })
      .get("/words", billingRead, reportQuery(wordsQuerySchema), async (c) => {
        const { format, ...query } = c.req.valid("query");
        const wordCounts = await readWords(await reportContext(c), {
          ...query,
          all: format === "csv",
        });
        if (format === "csv")
          return csv(c, "word-counts.csv", wordCountsCsv(wordCounts, query.groupBy));
        return c.json({ wordCounts });
      })
      .get("/time", reportQuery(loggedTimeQuerySchema), async (c) => {
        const { format, ...query } = c.req.valid("query");
        const time = await readTime(await reportContext(c), { ...query, all: format === "csv" });
        if (format === "csv") return csv(c, "time.csv", loggedTimeCsv(time.logged));
        return c.json({ time });
      })
      .get("/costs", billingRead, reportQuery(costsQuerySchema), async (c) => {
        const query = c.req.valid("query");
        const costs = await readCosts(await reportContext(c), query);
        if (query.format === "csv") return csv(c, "costs.csv", costsCsv(costs));
        return c.json({ costs });
      })
      .get("/cost-estimate", billingRead, reportQuery(costEstimateQuerySchema), async (c) => {
        const query = c.req.valid("query");
        const context = await reportContext(c);
        const { rateCard, format, ...filters } = query;
        const estimate = await queryCostEstimate({
          ...context,
          ...filters,
          rateCardName: rateCard ?? null,
        });
        if (format === "csv") return csv(c, "cost-estimate.csv", costEstimateCsv(estimate));
        return c.json({ costEstimate: { ...estimate, unit: filters.unit } });
      })
      .get("/budgets", billingRead, reportQuery(budgetsQuerySchema), async (c) => {
        const query = c.req.valid("query");
        const context = await reportContext(c);
        const budgets = await queryBudgets({
          organizationId: context.organizationId,
          projectIds: scopedProjectIds({
            projectIds: context.projectIds,
            projectId: query.projectId,
          }),
        });
        if (query.format === "csv") return csv(c, "budgets.csv", budgetsCsv(budgets));
        return c.json({ budgets });
      })
      .get("/rate-cards", billingRead, async (c) => {
        const role = c.var.auth.membership.role;
        if (!hasCapability(role, "billing:read"))
          return forbiddenResponse(c, "report_costs_forbidden");
        const rateCards = await listRateCards(c.var.auth.organization.localOrganizationId);
        return c.json({ rateCards, canManage: hasCapability(role, "billing:write") });
      })
      .put(
        "/rate-cards",
        billingWrite,
        reportBody(rateCardSchema, "invalid_rate_card"),
        async (c) => {
          const body = c.req.valid("json");
          const saved = await saveRateCard({
            ...body,
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
        },
      )
      .get("/tasks/:jobId/report", reportQuery(taskReportQuerySchema), async (c) => {
        const query = c.req.valid("query");
        const organizationId = c.var.auth.organization.localOrganizationId;
        const [job] = await db
          .select()
          .from(schema.jobs)
          .where(
            and(
              eq(schema.jobs.id, c.req.param("jobId")),
              await buildAccessibleJobsWhere(c.var.auth),
            ),
          );
        if (!job) return notFoundResponse(c, "job_not_found");
        const role = c.var.auth.membership.role;
        const financial = hasCapability(role, "billing:read");
        const userId = c.var.auth.user.localUserId;
        const money = financial && job.projectId;
        // Words, match bands and money are for the roles that see Reports; others see their own time.
        if (query.format === "csv" && !financial)
          return forbiddenResponse(c, "report_costs_forbidden");
        const [words, entries, estimate, stillToCome, pricing, locked] = await Promise.all([
          financial ? queryTaskWords({ organizationId, jobId: job.id, unit: query.unit }) : null,
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
          // The whole task, both steps: the card shows the task's cost, the table one step of it.
          money
            ? queryCostEstimate({
                organizationId,
                projectIds: [job.projectId!],
                jobIds: [job.id],
                unit: query.unit,
                rateCardName: query.rateCard ?? null,
              })
            : null,
          money
            ? queryStillToCome({
                organizationId,
                projectIds: [job.projectId!],
                jobIds: [job.id],
                rateCardName: query.rateCard ?? null,
              })
            : null,
          financial
            ? db
                .select()
                .from(schema.reportingTaskRates)
                .where(
                  and(
                    eq(schema.reportingTaskRates.organizationId, organizationId),
                    eq(schema.reportingTaskRates.jobId, job.id),
                  ),
                )
            : [],
          financial
            ? lockedPricingSteps({ organizationId, jobId: job.id, status: job.status })
            : null,
        ]);
        if (query.format === "csv" && words)
          return csv(c, "task-report.csv", taskWordsCsv(words, estimate, query.step));
        const payload = job.inputPayload as {
          sourceLocale?: string;
          targetLocales?: string[];
          targetLocale?: string;
          metadata?: { title?: string };
        };
        const canEditAll = hasCapability(role, "billing:write");
        const canLog = hasCapability(role, "jobs:write");
        // Other people's entries, and their totals, are for the roles that see what work costs.
        const visibleEntries = entries.rows.filter(
          (entry) => financial || entry.contributorId === userId,
        );
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
            unit: query.unit,
            step: query.step,
            words,
            estimate,
            stillToCome: stillToCome
              ? (stillToCome.get(job.projectId!) ?? { amountUsd: "0.00000000", incomplete: false })
              : null,
            time: {
              minutes: visibleEntries.reduce((sum, entry) => sum + entry.minutes, 0),
              people: new Set(visibleEntries.map((entry) => entry.contributorId)).size,
              entries: visibleEntries.map(({ contributorId, ...entry }) => ({
                ...entry,
                own: contributorId === userId,
                canEdit: canLog && (contributorId === userId || canEditAll),
              })),
            },
            canLogTime: canLog,
            // A task's own pricing, for each step: shown to the roles that see money.
            pricing: locked
              ? REPORT_STEPS.map((step) => {
                  const own = pricing.find((row) => row.step === step);
                  return {
                    step,
                    rateCardName: own?.rateCardName ?? null,
                    pricedAt: own?.pricedAt?.toISOString() ?? null,
                    estimatedMinutes: own?.estimatedMinutes ?? null,
                    overrideUsd: own?.overrideUsd ?? null,
                    locked: locked.has(step),
                  };
                })
              : null,
            canSetPricing: canEditAll,
          },
        });
      })
      // The state of the task's analysis per step (pending, done or failed): read by the Report
      // tab, every few seconds while a step is pending, so it says what is happening rather than
      // running the whole report again.
      .get("/tasks/:jobId/analysis", async (c) => {
        const organizationId = c.var.auth.organization.localOrganizationId;
        const [job] = await db
          .select({ id: schema.jobs.id })
          .from(schema.jobs)
          .where(
            and(
              eq(schema.jobs.id, c.req.param("jobId")),
              await buildAccessibleJobsWhere(c.var.auth),
            ),
          );
        if (!job) return notFoundResponse(c, "job_not_found");
        const states = await readTaskAnalysis({ organizationId, jobId: job.id });
        // The task's string counts and failure details are for the roles that see its words.
        const financial = hasCapability(c.var.auth.membership.role, "billing:read");
        return c.json({
          analysis: financial
            ? states
            : states.map((state) => ({ ...state, strings: null, error: null })),
        });
      })
      .put("/budgets", billingWrite, reportBody(budgetSchema, "invalid_budget"), async (c) => {
        const body = c.req.valid("json");
        if (!(await getAccessibleProjectIds(c.var.auth)).includes(body.projectId))
          return notFoundResponse(c, "project_not_found");
        if (
          body.rateCardName &&
          !(await rateCardExists(c.var.auth.organization.localOrganizationId, body.rateCardName))
        )
          return badRequestResponse(c, "rate_card_not_found");
        const [budget] = await db
          .insert(schema.reportingBudgets)
          .values({ ...body, organizationId: c.var.auth.organization.localOrganizationId })
          .onConflictDoUpdate({
            target: [schema.reportingBudgets.organizationId, schema.reportingBudgets.projectId],
            set: body,
          })
          .returning();
        return c.json({ budget });
      })
      .put(
        "/task-rates",
        billingWrite,
        reportBody(taskRateSchema, "invalid_task_rate"),
        async (c) => {
          const body = c.req.valid("json");
          const organizationId = c.var.auth.organization.localOrganizationId;
          const [job] = await db
            .select()
            .from(schema.jobs)
            .where(and(eq(schema.jobs.id, body.jobId), await buildAccessibleJobsWhere(c.var.auth)));
          if (!job) return notFoundResponse(c, "job_not_found");
          if (body.rateCardName && !(await rateCardExists(organizationId, body.rateCardName)))
            return badRequestResponse(c, "rate_card_not_found");
          const taskRate = await db.transaction(async (tx) => {
            const [lockedJob] = await tx
              .select()
              .from(schema.jobs)
              .where(eq(schema.jobs.id, job.id))
              .for("update");
            const locked = await lockedPricingSteps(
              { organizationId, jobId: job.id, status: lockedJob.status },
              tx,
            );
            if (locked.has(body.step)) return null;
            // The task keeps the card's prices as they are now; holding the card's save lock keeps a
            // save in progress from landing on either side of that moment.
            if (body.rateCardName) await lockRateCard(tx, organizationId, body.rateCardName);
            const values = {
              ...body,
              pricedAt: body.rateCardName ? sql`clock_timestamp()` : null,
            };
            const [saved] = await tx
              .insert(schema.reportingTaskRates)
              .values({ ...values, organizationId })
              .onConflictDoUpdate({
                target: [
                  schema.reportingTaskRates.organizationId,
                  schema.reportingTaskRates.jobId,
                  schema.reportingTaskRates.step,
                ],
                set: values,
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
              "A task's pricing can only change before work on that step starts.",
            );
          return c.json({ taskRate });
        },
      )
      .post(
        "/time-entries",
        canLogTime,
        reportBody(timeSchema, "invalid_time_entry"),
        async (c) => {
          const body = c.req.valid("json");
          const organizationId = c.var.auth.organization.localOrganizationId;
          const [job] = await db
            .select()
            .from(schema.jobs)
            .where(and(eq(schema.jobs.id, body.jobId), await buildAccessibleJobsWhere(c.var.auth)));
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
            targetLocale: body.targetLocale,
            step: body.step,
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
                  eq(schema.reportingTaskRates.step, body.step),
                ),
              );
            const [entry] = await tx
              .insert(schema.reportingTimeEntries)
              .values({
                ...body,
                workDate: new Date(body.workDate + "T00:00:00Z"),
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
        },
      )
      .patch("/time-entries/:id", reportBody(timeUpdateSchema, "invalid_time_entry"), async (c) => {
        const body = c.req.valid("json");
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
          const workDate = new Date(body.workDate + "T00:00:00Z");
          await tx
            .update(schema.reportingTimeEntries)
            .set({ ...body, workDate })
            .where(eq(schema.reportingTimeEntries.id, entry.id));
          if (!rate || rate.basis === "hour")
            await tx
              .update(schema.reportingCosts)
              .set({
                amountUsd: rate ? hourlyCost(rate.rate, body.minutes) : null,
                createdAt: workDate,
              })
              .where(eq(schema.reportingCosts.timeEntryId, entry.id));
          await tx.insert(schema.reportingAudit).values({
            organizationId,
            actorId: c.var.auth.user.localUserId,
            resourceId: entry.id,
            action: "time_updated",
            before: entry,
            after: body,
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
  );
}
