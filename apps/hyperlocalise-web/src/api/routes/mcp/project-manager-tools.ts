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
  getAccessibleProjectIds,
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
import { db, schema } from "@/lib/database/client";
import { workspaceReportsFlag } from "@/lib/flags/workspace-flags";
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
} from "@/lib/reporting/ai-usage-origins";
import {
  REPORT_KINDS,
  readActivity,
  readAi,
  readCosts,
  readTime,
  readWords,
  summaryFreshness,
  type ReportReadContext,
} from "@/lib/reporting/report-reads";
import { REPORT_STEPS, REPORT_UNITS } from "@/lib/reporting/report-units";
import { getReportingStart } from "@/lib/reporting/reporting-start";

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
      "activity (default): words arrived and finished in the dates, by where the text came from, with the previous period; words: word counts by match band, by project or by task; time: time people logged and automated run time; ai: AI calls, tokens, images, videos and billing's charge, grouped by one detail and optionally a second; costs: what was spent, by project.",
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
  groupBy: z
    .enum([
      "project",
      "task",
      "week",
      ...AI_USAGE_DIMENSIONS.filter((dimension) => dimension !== "project" && dimension !== "task"),
    ])
    .optional()
    .describe(
      "Words: rows per project (default), per task (50 tasks a page), or per week and project. AI: area (default), feature, model, provider, channel, key, project, task or automation (50 groups a page).",
    ),
  thenBy: z
    .enum(AI_USAGE_DIMENSIONS)
    .optional()
    .describe("AI only: a second detail to split each group by, other than groupBy."),
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
    async (input) => {
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

      const startedAt = await getReportingStart(organizationId);
      const context: ReportReadContext = {
        organizationId,
        projectIds: await getAccessibleProjectIds(apiAuth),
        startedDay: startedAt ? startedAt.toISOString().slice(0, 10) : null,
        today: new Date().toISOString().slice(0, 10),
        financial: true,
        userId: apiAuth.user.localUserId,
      };
      const summary = await summaryFreshness(organizationId);
      const shared = { kind, summary, stillUpdating: summary.pendingDays > 0 };
      switch (kind) {
        case "activity":
          return mcpToolJson({
            ...shared,
            activity: await readActivity(
              context,
              parsed.data as z.infer<typeof REPORT_QUERY_SCHEMAS.activity>,
            ),
          });
        case "words":
          return mcpToolJson({
            ...shared,
            wordCounts: await readWords(
              context,
              parsed.data as z.infer<typeof REPORT_QUERY_SCHEMAS.words>,
            ),
          });
        case "time":
          return mcpToolJson({
            ...shared,
            time: await readTime(context, parsed.data as z.infer<typeof REPORT_QUERY_SCHEMAS.time>),
          });
        case "ai":
          return mcpToolJson({
            ...shared,
            aiUsage: await readAi(context, {
              ...(parsed.data as z.infer<typeof REPORT_QUERY_SCHEMAS.ai>),
              all: false,
            }),
          });
        default:
          return mcpToolJson({
            ...shared,
            costs: await readCosts(
              context,
              parsed.data as z.infer<typeof REPORT_QUERY_SCHEMAS.costs>,
            ),
          });
      }
    },
  );
}
