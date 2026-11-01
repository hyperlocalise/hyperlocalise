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
import { and, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { isJobMutationAllowed } from "@/api/auth/capability-guards";
import { hasCapability } from "@/api/auth/policy";
import {
  buildAccessibleJobsWhere,
  canAccessProject,
  ownedProjectWhere,
} from "@/api/auth/team-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { isWorkspaceFeatureFlagEnabled } from "@/api/middleware/workspace-feature-flag";
import {
  MCP_DESTRUCTIVE_TOOL,
  MCP_READ_ONLY_TOOL,
  mcpToolError,
  mcpToolJson,
} from "@/api/routes/mcp/mcp-tool-result";
import {
  overviewTriageJobStatusValues,
  openJobStatusValues,
} from "@/api/routes/project/job.schema";
import { REPORT_QUERY_SCHEMAS } from "@/api/routes/reports/reports.schema";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-client";
import { createGoSvcServerClient } from "@/lib/go-svc/go-svc-server-client";
import { db, schema } from "@/lib/database/client";
import { workspaceReportsFlag } from "@/lib/flags/workspace-flags";
import { createLogger } from "@/lib/log";
import { formatMemberDisplayName } from "@/lib/members/member-management";
import { isErr } from "@/lib/primitives/result/results";
import { projectIdSchema } from "@/lib/projects/identity/project-id";
import { listAssignableIssueMembers } from "@/lib/projects/issue-sheet/issue-sheet-assignee";
import { cancelNativeJob } from "@/lib/projects/jobs/cancel-native-job";
import { updateNativeJob } from "@/lib/projects/jobs/update-native-job";
import {
  AI_CHANNELS,
  AI_KEY_TYPES,
  AI_ORIGINS,
  AI_USAGE_DIMENSIONS,
  AI_USAGE_MEASURES,
} from "@/lib/reporting/ai-usage-origins";
import { REPORT_KINDS } from "@/lib/reporting/report-reads";
import {
  REPORT_STEPS,
  REPORT_UNITS,
  WORD_COUNT_INTERVALS,
  WORD_COUNT_SPLITS,
} from "@/lib/reporting/report-units";

const logger = createLogger("mcp-project-manager-tools");

/** Just past go-svc's own 30 s limit, so a stalled call answers instead of hanging. */
const GET_REPORT_TIME_LIMIT_MS = 35_000;

/**
 * go-svc's answers to `get_report` that are about the member's request, passed on as they are.
 * Anything else (go-svc unreachable, an internal error, the server call refused) is ours to fix.
 * The tool checks the flag itself first, so go-svc's `feature_unavailable` means its own lookup
 * failed or is a minute behind: not passed on as "not enabled".
 */
const REPORT_REFUSAL_CODES = new Set([
  "organization_access_denied",
  "report_forbidden",
  "invalid_report_query",
  "reports_busy",
  "report_timed_out",
]);

/** A provider job's due date, or a native job's own. Needs externalJobDetails left-joined. */
const jobDueDateSql =
  sql<Date | null>`coalesce(${schema.externalJobDetails.dueDate}, ${schema.jobs.dueAt})`.mapWith(
    schema.jobs.dueAt,
  );

const jobIdSchema = z.string().trim().min(1).max(128).describe("ID of an accessible job.");

const mcpListProjectMembersInputSchema = z.object({
  projectId: projectIdSchema.describe("ID of the accessible Hyperlocalise project."),
});

const mcpListOpenJobsInputSchema = z.object({
  projectId: projectIdSchema
    .optional()
    .describe("Optional project ID. When omitted, lists open jobs across accessible projects."),
  owner: z
    .union([z.literal("me"), z.literal("unassigned"), z.uuid()])
    .optional()
    .describe(
      "Optional owner filter: me, unassigned, or a userId returned by list_project_members.",
    ),
  includeFailed: z
    .boolean()
    .default(true)
    .describe("Include failed jobs, which usually need someone to retry or cancel them."),
  limit: z.number().int().min(1).max(50).default(20).describe("Maximum number of jobs to return."),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of jobs to skip before returning results."),
});

const mcpUpdateJobInputSchema = z
  .object({
    jobId: jobIdSchema,
    title: z.string().trim().min(1).max(256).optional().describe("Replacement job title."),
    description: z
      .string()
      .trim()
      .max(2_048)
      .nullable()
      .optional()
      .describe("Replacement job description, or null to clear it."),
    ownerUserId: z
      .uuid()
      .nullable()
      .optional()
      .describe("userId from list_project_members to assign the job to, or null to unassign it."),
    dueAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional()
      .describe("ISO 8601 due date, such as 2026-05-01T17:00:00Z, or null to clear it."),
  })
  .refine(
    (input) =>
      input.title !== undefined ||
      input.description !== undefined ||
      input.ownerUserId !== undefined ||
      input.dueAt !== undefined,
    { message: "Provide at least one of title, description, ownerUserId, or dueAt" },
  );

const mcpCancelJobInputSchema = z.object({ jobId: jobIdSchema });

const mcpDay = z.iso.date();
const mcpGetReportInputSchema = z.object({
  report: z
    .enum(REPORT_KINDS)
    .default("activity")
    .describe(
      "activity (default): words arrived and finished in the dates, by where the text came from, with the previous period; words: word counts by match band, by project, task, week, language or task step, with a series over time; time: time people logged and automated run time; ai: AI calls, tokens, images, videos and billing's charge, grouped by one detail and optionally a second; costs: what was spent, by project.",
    ),
  from: mcpDay.optional().describe("Start date (YYYY-MM-DD, UTC). Defaults to 28 days ago."),
  to: mcpDay.optional().describe("End date (YYYY-MM-DD, UTC). Defaults to today."),
  projectId: z.string().min(1).max(200).optional().describe("Optional project ID filter."),
  jobId: z.string().min(1).max(200).optional().describe("Optional job ID filter."),
  targetLocale: z
    .string()
    .min(2)
    .max(35)
    .optional()
    .describe("Optional target locale filter. Not for ai."),
  step: z
    .enum(REPORT_STEPS)
    .optional()
    .describe("Workflow step: translation (default) or review. Not for costs or ai."),
  unit: z
    .enum(REPORT_UNITS)
    .optional()
    .describe(
      "Unit for activity and words: words (default), strings, characters, characters_with_spaces.",
    ),
  mode: z
    .enum(["arrived", "finished"])
    .optional()
    .describe("Words only: strings that arrived (default) or were finished in the dates."),
  split: z
    .enum(WORD_COUNT_SPLITS)
    .optional()
    .describe(
      "Words only: what the series splits each point by: project (default) or language, the five largest and Other; band, in tiers: exact (100% and repetitions), high (95-99%), fuzzy (75-94%), low (50-74%), new (new, and memory unavailable); or task_step: translate, post_edit, proofread, other, no_task, where a string in more than one task counts in each, so points can be larger than with the other splits.",
    ),
  per: z
    .enum(WORD_COUNT_INTERVALS)
    .optional()
    .describe(
      "Words only: how long each point of the series covers: day, week or month. By default days, or weeks for periods over 45 days.",
    ),
  groupBy: z
    .enum([
      "project",
      "task",
      "week",
      "language",
      "task_step",
      ...AI_USAGE_DIMENSIONS.filter((dimension) => dimension !== "project" && dimension !== "task"),
    ])
    .optional()
    .describe(
      "Words: rows per project (default), per task (50 tasks a page), per week and project, per language, or per task step and language. Rows per task or task step count a string in each task that holds it, so they can add up to more than total and bandTotals, which count it once per project. AI: area (default), feature, model, provider, channel, key, project, task or automation (50 groups a page).",
    ),
  thenBy: z
    .enum(AI_USAGE_DIMENSIONS)
    .optional()
    .describe("AI only: a second detail to split each group by, other than groupBy."),
  rankBy: z
    .enum(AI_USAGE_MEASURES)
    .optional()
    .describe(
      "AI only: what the largest groups are by: tokens (default, including cache and reasoning), calls or charge (AI credit used).",
    ),
  area: z.enum(AI_ORIGINS).optional().describe("AI only: where the AI was called."),
  feature: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("AI only: billing's source name for the call, as in the feature groups."),
  model: z.string().min(1).max(200).optional().describe("AI only: model id."),
  provider: z.string().min(1).max(200).optional().describe("AI only: model provider."),
  channel: z.enum(AI_CHANNELS).optional().describe("AI only: how the call reached Hyperlocalise."),
  key: z
    .enum(AI_KEY_TYPES)
    .optional()
    .describe(
      "AI only: our_ai (plan credit), own_key (the workspace's provider key) or not_recorded.",
    ),
  automationId: z.string().min(1).max(200).optional().describe("AI only: automation ID filter."),
  page: z.number().int().min(1).max(10_000).optional().describe("Page of rows, from 1."),
});

function readJobMetadataString(inputPayload: unknown, field: "title" | "description") {
  if (!inputPayload || typeof inputPayload !== "object") {
    return null;
  }
  const metadata = (inputPayload as Record<string, unknown>).metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() ? value : null;
}

const jobSummarySelect = {
  id: schema.jobs.id,
  projectId: schema.jobs.projectId,
  projectName: schema.projects.name,
  kind: schema.jobs.kind,
  type: schema.translationJobDetails.type,
  status: schema.jobs.status,
  inputPayload: schema.jobs.inputPayload,
  assigneeType: schema.jobs.assigneeType,
  ownerUserId: schema.jobs.ownerUserId,
  ownerEmail: schema.users.email,
  ownerFirstName: schema.users.firstName,
  ownerLastName: schema.users.lastName,
  externalTitle: schema.externalJobDetails.title,
  externalProviderKind: schema.externalJobDetails.providerKind,
  externalUrl: schema.externalJobDetails.externalUrl,
  externalTargetLocales: schema.externalJobDetails.targetLocales,
  dueDate: jobDueDateSql,
  lastError: schema.jobs.lastError,
  createdAt: schema.jobs.createdAt,
  updatedAt: schema.jobs.updatedAt,
};

function jobSummaryQuery(where: SQL | undefined) {
  return db
    .select(jobSummarySelect)
    .from(schema.jobs)
    .leftJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
    .leftJoin(
      schema.projects,
      and(
        eq(schema.projects.id, schema.jobs.projectId),
        eq(schema.projects.organizationId, schema.jobs.organizationId),
      ),
    )
    .leftJoin(schema.users, eq(schema.users.id, schema.jobs.ownerUserId))
    .where(where);
}

type JobSummaryRow = Awaited<ReturnType<typeof jobSummaryQuery>>[number];

function toMcpJobSummary(row: JobSummaryRow, now: Date) {
  const owner =
    row.ownerUserId && row.ownerEmail
      ? {
          userId: row.ownerUserId,
          displayName: formatMemberDisplayName({
            firstName: row.ownerFirstName,
            lastName: row.ownerLastName,
            email: row.ownerEmail,
          }),
        }
      : null;

  return {
    id: row.id,
    title: readJobMetadataString(row.inputPayload, "title") ?? row.externalTitle ?? null,
    projectId: row.projectId,
    projectName: row.projectName ?? null,
    kind: row.kind,
    type: row.type ?? null,
    status: row.status,
    assigneeType: row.assigneeType ?? null,
    owner,
    provider: row.externalProviderKind ?? null,
    externalUrl: row.externalUrl ?? null,
    targetLocales: row.externalTargetLocales ?? null,
    dueDate: row.dueDate?.toISOString() ?? null,
    overdue: row.dueDate ? row.dueDate.getTime() < now.getTime() : false,
    lastError: row.lastError ? row.lastError.slice(0, 500) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function registerProjectManagerMcpTools(server: McpServer, apiAuth: ApiAuthContext) {
  const organizationId = apiAuth.organization.localOrganizationId;

  server.registerTool(
    "list_project_members",
    {
      annotations: MCP_READ_ONLY_TOOL,
      description:
        "List active members who can be assigned issues or jobs in a project. Use userId as assigneeUserId on create_issue/update_issue or ownerUserId on update_job.",
      inputSchema: mcpListProjectMembersInputSchema,
    },
    async ({ projectId }) => {
      const [project] = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(await ownedProjectWhere(apiAuth, projectId))
        .limit(1);

      if (!project) {
        return mcpToolError("project_not_found", "Project not found or inaccessible");
      }

      const members = await listAssignableIssueMembers({
        organizationId,
        projectId: project.id,
        actorUserId: apiAuth.user.localUserId,
      });

      return mcpToolJson({
        members: members.map((member) => ({
          userId: member.userId,
          displayName: member.displayName,
          email: member.email,
          isCurrentUser: member.isCurrentUser,
        })),
      });
    },
  );

  server.registerTool(
    "list_open_jobs",
    {
      annotations: MCP_READ_ONLY_TOOL,
      description:
        "List jobs that still need attention (queued, running, waiting for review, and optionally failed) with title, owner, due date, and an overdue flag. Sorted by due date, soonest first, then most recently updated. Use this for status updates and workload questions; use list_jobs to look up translation jobs by source file.",
      inputSchema: mcpListOpenJobsInputSchema,
    },
    async ({ projectId, owner, includeFailed, limit, offset }) => {
      if (projectId && !(await canAccessProject(apiAuth, projectId))) {
        return mcpToolError("project_not_found", "Project not found or inaccessible");
      }

      const statuses = includeFailed ? overviewTriageJobStatusValues : openJobStatusValues;
      const filters: SQL[] = [
        await buildAccessibleJobsWhere(apiAuth),
        inArray(schema.jobs.status, [...statuses]),
      ];

      if (projectId) {
        filters.push(eq(schema.jobs.projectId, projectId));
      }

      if (owner === "me") {
        filters.push(eq(schema.jobs.ownerUserId, apiAuth.user.localUserId));
      } else if (owner === "unassigned") {
        filters.push(isNull(schema.jobs.ownerUserId));
      } else if (owner) {
        filters.push(eq(schema.jobs.ownerUserId, owner));
      }

      const where = and(...filters);
      const [rows, [totalRow]] = await Promise.all([
        jobSummaryQuery(where)
          .orderBy(sql`${jobDueDateSql} asc nulls last`, desc(schema.jobs.updatedAt))
          .limit(limit)
          .offset(offset),
        db.select({ value: count() }).from(schema.jobs).where(where),
      ]);

      const total = totalRow?.value ?? 0;
      const nextOffset = offset + rows.length;
      const hasMore = nextOffset < total;
      const now = new Date();

      return mcpToolJson({
        total,
        pagination: { limit, offset, hasMore, nextOffset: hasMore ? nextOffset : null },
        jobs: rows.map((row) => toMcpJobSummary(row, now)),
      });
    },
  );

  server.registerTool(
    "update_job",
    {
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      description:
        "Rename, re-describe, reassign, or set the due date of one native Hyperlocalise job. Jobs mirrored from an external TMS must be updated in that TMS.",
      inputSchema: mcpUpdateJobInputSchema,
    },
    async ({ jobId, title, description, ownerUserId, dueAt }) => {
      if (!isJobMutationAllowed(apiAuth.membership.role)) {
        return mcpToolError("forbidden", "Insufficient permissions to update jobs");
      }

      let ownerWorkosUserId: string | null | undefined;
      if (ownerUserId === null) {
        ownerWorkosUserId = null;
      } else if (ownerUserId) {
        const [owner] = await db
          .select({ workosUserId: schema.users.workosUserId })
          .from(schema.users)
          .where(eq(schema.users.id, ownerUserId))
          .limit(1);

        if (!owner) {
          return mcpToolError("owner_not_found", "Assigned owner must be an organization member");
        }
        ownerWorkosUserId = owner.workosUserId;
      }

      const accessWhere = await buildAccessibleJobsWhere(apiAuth);
      const result = await updateNativeJob({
        organizationId,
        jobId,
        body: {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(ownerWorkosUserId !== undefined ? { ownerWorkosUserId } : {}),
          ...(dueAt !== undefined ? { dueAt } : {}),
        },
        accessWhere,
      });

      if (isErr(result)) {
        if (result.error.code === "job_not_found") {
          return mcpToolError("job_not_found", "Job not found");
        }
        return mcpToolError(result.error.code, result.error.message);
      }

      const [row] = await jobSummaryQuery(and(eq(schema.jobs.id, jobId), accessWhere)).limit(1);
      if (!row) {
        return mcpToolError("job_not_found", "Job not found");
      }

      return mcpToolJson({ job: toMcpJobSummary(row, new Date()) });
    },
  );

  server.registerTool(
    "cancel_job",
    {
      annotations: MCP_DESTRUCTIVE_TOOL,
      description:
        "Cancel one queued, running, or waiting-for-review native job. This stops further work on it and cannot be undone. Jobs mirrored from an external TMS must be cancelled in that TMS.",
      inputSchema: mcpCancelJobInputSchema,
    },
    async ({ jobId }) => {
      if (!isJobMutationAllowed(apiAuth.membership.role)) {
        return mcpToolError("forbidden", "Insufficient permissions to cancel jobs");
      }

      const result = await cancelNativeJob({
        organizationId,
        jobId,
        actorUserId: apiAuth.user.localUserId,
        accessWhere: await buildAccessibleJobsWhere(apiAuth),
      });

      if (isErr(result)) {
        return result.error.code === "job_action_unavailable"
          ? mcpToolError(
              "job_action_unavailable",
              "Only queued, running, or waiting-for-review native jobs can be cancelled",
            )
          : mcpToolError("job_not_found", "Job not found");
      }

      return mcpToolJson({ id: result.value.id, status: "cancelled" });
    },
  );

  server.registerTool(
    "get_report",
    {
      annotations: MCP_READ_ONLY_TOOL,
      description:
        "Get one of the Reports page's reports for accessible projects, with the same fields the page shows: activity (words arrived and finished, by where the text came from), words (word counts by match band), time (logged and automated time), ai (AI calls, tokens and billing's charge) or costs (what was spent). Days are UTC. Figures can lag the latest work by up to about 15 minutes; stillUpdating is true while recent work is still being counted. ai reads billing's records directly, so stillUpdating does not apply to it; calls whose charge billing has not recorded are counted in unrecordedCharges. Needs billing access.",
      inputSchema: mcpGetReportInputSchema,
    },
    async (input, extra) => {
      if (!(await isWorkspaceFeatureFlagEnabled(workspaceReportsFlag, apiAuth))) {
        return mcpToolError("feature_unavailable", "Reports is not enabled for this workspace");
      }
      // Reports are for the roles that see what work costs: admins and localization managers.
      if (!hasCapability(apiAuth.membership.role, "billing:read")) {
        return mcpToolError("report_forbidden", "Reports require billing access");
      }

      const { report: kind, ...query } = input;
      const parsed = REPORT_QUERY_SCHEMAS[kind].safeParse({ ...query, format: "json" });
      if (!parsed.success) {
        return mcpToolError("invalid_report_query", "Invalid report query", {
          issues: parsed.error.issues.map((issue) => issue.message),
        });
      }

      // go-svc reads the report as the member, with the member's own project access.
      const { format: _format, ...reportQuery } = parsed.data as Record<string, unknown>;
      try {
        return mcpToolJson(
          await createGoSvcServerClient().reports.internal(
            kind,
            {
              organizationId,
              userId: apiAuth.user.localUserId,
              query: reportQuery as Record<string, string | number | boolean | undefined>,
            },
            {
              signal: AbortSignal.any([
                extra.signal,
                AbortSignal.timeout(GET_REPORT_TIME_LIMIT_MS),
              ]),
            },
          ),
        );
      } catch (error) {
        if (error instanceof GoSvcClientError && REPORT_REFUSAL_CODES.has(error.code))
          return mcpToolError(error.code, error.message);
        if (error instanceof Error && error.name === "AbortError") throw error;
        logger.warn(
          {
            error: error instanceof Error ? error.message : String(error),
            code: error instanceof GoSvcClientError ? error.code : null,
            status: error instanceof GoSvcClientError ? error.status : null,
          },
          "get_report could not read go-svc's Reports",
        );
        return mcpToolError(
          "reports_unavailable",
          "Reports could not be read just now; try again later",
        );
      }
    },
  );
}
