import { and, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { OrganizationIssuesQuery } from "@/api/routes/issues/issues.schema";
import { buildAccessibleProjectsWhere } from "@/api/auth/team-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";

const assigneeUsers = alias(schema.users, "org_issue_assignee_users");

export type OrganizationIssueListItem = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string;
  issueType: string;
  status: string;
  targetLocale: string | null;
  sourcePath: string | null;
  segmentId: string | null;
  linkKind: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  reporter: string | null;
  assignee: string | null;
  assigneeUserId: string | null;
  key: string | null;
  sourceText: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type OrganizationIssueListResult = {
  issues: OrganizationIssueListItem[];
  total: number;
  summary: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    wontFix: number;
  };
};

function formatUser(row: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}) {
  if (!row.email) {
    return null;
  }
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ");
  return name || row.email;
}

function buildOrganizationIssueConditions(input: {
  organizationId: string;
  actorUserId: string;
  query: OrganizationIssuesQuery;
  accessibleProjectsWhere: SQL;
}) {
  const conditions: SQL[] = [
    eq(schema.issueSheetIssues.organizationId, input.organizationId),
    input.accessibleProjectsWhere,
  ];

  const view = input.query.view;
  if (view === "my_work") {
    conditions.push(eq(schema.issueSheetIssues.assigneeUserId, input.actorUserId));
    conditions.push(inArray(schema.issueSheetIssues.status, ["open", "in_progress"]));
  } else if (view === "qa_triage") {
    conditions.push(eq(schema.issueSheetIssues.issueType, "qa_failure"));
    conditions.push(isNull(schema.issueSheetIssues.assigneeUserId));
    conditions.push(inArray(schema.issueSheetIssues.status, ["open", "in_progress"]));
  } else if (view === "source_context") {
    conditions.push(
      inArray(schema.issueSheetIssues.issueType, [
        "source_mistake",
        "context_request",
        "general_question",
      ]),
    );
    conditions.push(inArray(schema.issueSheetIssues.status, ["open", "in_progress"]));
  } else if (view === "all_open") {
    conditions.push(inArray(schema.issueSheetIssues.status, ["open", "in_progress"]));
  }

  if (!view && input.query.status && input.query.status !== "all") {
    conditions.push(eq(schema.issueSheetIssues.status, input.query.status));
  }
  if (input.query.issueType && input.query.issueType !== "all") {
    conditions.push(eq(schema.issueSheetIssues.issueType, input.query.issueType));
  }
  if (input.query.locale) {
    conditions.push(eq(schema.issueSheetIssues.targetLocale, input.query.locale));
  }
  if (input.query.assignee === "me") {
    conditions.push(eq(schema.issueSheetIssues.assigneeUserId, input.actorUserId));
  } else if (input.query.assignee === "unassigned") {
    conditions.push(isNull(schema.issueSheetIssues.assigneeUserId));
  } else if (input.query.assignee) {
    conditions.push(eq(schema.issueSheetIssues.assigneeUserId, input.query.assignee));
  }
  if (input.query.search) {
    const search = `%${input.query.search}%`;
    conditions.push(
      or(
        ilike(schema.issueSheetIssues.title, search),
        ilike(schema.issueSheetIssues.description, search),
        ilike(schema.issueSheetIssues.sourcePath, search),
        ilike(schema.projects.name, search),
      )!,
    );
  }

  return conditions;
}

export class OrganizationIssueService {
  constructor(private readonly database = db) {}

  async list(
    auth: ApiAuthContext,
    query: OrganizationIssuesQuery,
  ): Promise<OrganizationIssueListResult> {
    const organizationId = auth.organization.localOrganizationId;
    const accessibleProjectsWhere = await buildAccessibleProjectsWhere(auth);
    const issueProjectJoin = eq(schema.issueSheetIssues.projectId, schema.projects.id);
    const conditions = buildOrganizationIssueConditions({
      organizationId,
      actorUserId: auth.user.localUserId,
      query,
      accessibleProjectsWhere,
    });
    const where = and(...conditions, issueProjectJoin);

    const [rows, totalRow, summary] = await Promise.all([
      this.database
        .select({
          id: schema.issueSheetIssues.id,
          projectId: schema.issueSheetIssues.projectId,
          projectName: schema.projects.name,
          title: schema.issueSheetIssues.title,
          description: schema.issueSheetIssues.description,
          issueType: schema.issueSheetIssues.issueType,
          status: schema.issueSheetIssues.status,
          targetLocale: schema.issueSheetIssues.targetLocale,
          sourcePath: schema.issueSheetIssues.sourcePath,
          segmentId: schema.issueSheetIssues.segmentId,
          linkKind: schema.issueSheetIssues.linkKind,
          linkLabel: schema.issueSheetIssues.linkLabel,
          linkUrl: schema.issueSheetIssues.linkUrl,
          assigneeUserId: schema.issueSheetIssues.assigneeUserId,
          reporterFirstName: schema.users.firstName,
          reporterLastName: schema.users.lastName,
          reporterEmail: schema.users.email,
          assigneeFirstName: assigneeUsers.firstName,
          assigneeLastName: assigneeUsers.lastName,
          assigneeEmail: assigneeUsers.email,
          key: schema.projectTranslationKeys.key,
          sourceText: schema.projectTranslationKeys.sourceText,
          createdAt: schema.issueSheetIssues.createdAt,
          updatedAt: schema.issueSheetIssues.updatedAt,
          resolvedAt: schema.issueSheetIssues.resolvedAt,
        })
        .from(schema.issueSheetIssues)
        .innerJoin(schema.projects, issueProjectJoin)
        .leftJoin(schema.users, eq(schema.issueSheetIssues.reporterUserId, schema.users.id))
        .leftJoin(assigneeUsers, eq(schema.issueSheetIssues.assigneeUserId, assigneeUsers.id))
        .leftJoin(
          schema.projectTranslationKeys,
          eq(schema.issueSheetIssues.translationKeyId, schema.projectTranslationKeys.id),
        )
        .where(where)
        .orderBy(desc(schema.issueSheetIssues.updatedAt))
        .limit(query.limit)
        .offset(query.offset),
      this.database
        .select({ value: count() })
        .from(schema.issueSheetIssues)
        .innerJoin(schema.projects, issueProjectJoin)
        .where(where),
      this.loadSummary(organizationId, accessibleProjectsWhere),
    ]);

    return {
      issues: rows.map((row) => ({
        id: row.id,
        projectId: row.projectId,
        projectName: row.projectName,
        title: row.title,
        description: row.description,
        issueType: row.issueType,
        status: row.status,
        targetLocale: row.targetLocale,
        sourcePath: row.sourcePath,
        segmentId: row.segmentId,
        linkKind: row.linkKind,
        linkLabel: row.linkLabel,
        linkUrl: row.linkUrl,
        assigneeUserId: row.assigneeUserId,
        reporter: formatUser({
          firstName: row.reporterFirstName,
          lastName: row.reporterLastName,
          email: row.reporterEmail,
        }),
        assignee: formatUser({
          firstName: row.assigneeFirstName,
          lastName: row.assigneeLastName,
          email: row.assigneeEmail,
        }),
        key: row.key,
        sourceText: row.sourceText,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
      })),
      total: totalRow[0]?.value ?? 0,
      summary,
    };
  }

  private async loadSummary(organizationId: string, accessibleProjectsWhere: SQL) {
    const issueProjectJoin = eq(schema.issueSheetIssues.projectId, schema.projects.id);
    const rows = await this.database
      .select({
        status: schema.issueSheetIssues.status,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(schema.issueSheetIssues)
      .innerJoin(schema.projects, issueProjectJoin)
      .where(
        and(
          eq(schema.issueSheetIssues.organizationId, organizationId),
          accessibleProjectsWhere,
          issueProjectJoin,
        ),
      )
      .groupBy(schema.issueSheetIssues.status);

    const counts = new Map(rows.map((row) => [row.status, row.count]));
    return {
      total: rows.reduce((sum, row) => sum + row.count, 0),
      open: counts.get("open") ?? 0,
      inProgress: counts.get("in_progress") ?? 0,
      resolved: counts.get("resolved") ?? 0,
      wontFix: counts.get("wont_fix") ?? 0,
    };
  }
}

export const organizationIssueService = new OrganizationIssueService();
