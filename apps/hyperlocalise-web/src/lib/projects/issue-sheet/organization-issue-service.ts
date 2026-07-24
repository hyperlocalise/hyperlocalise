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
import { and, count, eq, ilike, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { OrganizationIssuesQuery } from "@/api/routes/issues/issues.schema";
import { buildAccessibleProjectsWhere } from "@/api/auth/team-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";

import {
  buildIssueListFilterConditions,
  buildIssueListOrderBy,
  issueListNeedsCountPriorityJoin,
  issueListNeedsPriorityJoin,
  priorityColumnJoin,
  priorityColumns,
  priorityValueJoin,
  priorityValues,
} from "./issue-list-query";
import { IssueSheetService, type IssueSheetIssue } from "./issue-sheet-service";

const assigneeUsers = alias(schema.users, "org_issue_assignee_users");

export type OrganizationIssueListItem = {
  id: string;
  number: number;
  identifier: string;
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

export type OrganizationIssueDetail = IssueSheetIssue & {
  projectId: string;
  projectName: string;
};

export class OrganizationIssueService {
  constructor(
    private readonly database = db,
    private readonly issueSheetService = new IssueSheetService(database),
  ) {}

  async getById(auth: ApiAuthContext, issueId: string): Promise<OrganizationIssueDetail | null> {
    const organizationId = auth.organization.localOrganizationId;
    const accessibleProjectsWhere = await buildAccessibleProjectsWhere(auth);
    const issueProjectJoin = eq(schema.issueSheetIssues.projectId, schema.projects.id);

    const rows = await this.database
      .select({
        id: schema.issueSheetIssues.id,
        projectId: schema.issueSheetIssues.projectId,
        projectName: schema.projects.name,
      })
      .from(schema.issueSheetIssues)
      .innerJoin(schema.projects, issueProjectJoin)
      .where(
        and(
          eq(schema.issueSheetIssues.organizationId, organizationId),
          eq(schema.issueSheetIssues.id, issueId),
          accessibleProjectsWhere,
          issueProjectJoin,
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    const issue = await this.issueSheetService.getIssue({
      organizationId,
      projectId: row.projectId,
      issueId: row.id,
      actorUserId: auth.user.localUserId,
    });
    if (!issue) {
      return null;
    }

    return {
      ...issue,
      projectId: row.projectId,
      projectName: row.projectName,
    };
  }

  async list(
    auth: ApiAuthContext,
    query: OrganizationIssuesQuery,
  ): Promise<OrganizationIssueListResult> {
    const organizationId = auth.organization.localOrganizationId;
    const accessibleProjectsWhere = await buildAccessibleProjectsWhere(auth);
    const issueProjectJoin = eq(schema.issueSheetIssues.projectId, schema.projects.id);
    const search = query.search ? `%${query.search}%` : null;
    const filterConditions = buildIssueListFilterConditions({
      actorUserId: auth.user.localUserId,
      query,
      searchTargets: search
        ? [
            ilike(schema.issueSheetIssues.title, search),
            ilike(schema.issueSheetIssues.description, search),
            ilike(schema.issueSheetIssues.sourcePath, search),
            ilike(schema.projects.name, search),
          ]
        : undefined,
    });
    const conditions: SQL[] = [
      eq(schema.issueSheetIssues.organizationId, organizationId),
      accessibleProjectsWhere,
      ...filterConditions,
    ];
    const where = and(...conditions, issueProjectJoin);
    const needsPriorityJoin = issueListNeedsPriorityJoin(query);
    const needsCountPriorityJoin = issueListNeedsCountPriorityJoin(query);
    const orderBy = buildIssueListOrderBy(query);

    let listQuery = this.database
      .select({
        id: schema.issueSheetIssues.id,
        number: schema.issueSheetIssues.number,
        identifier: schema.issueSheetIssues.identifier,
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
      .$dynamic();

    let countQuery = this.database
      .select({ value: count() })
      .from(schema.issueSheetIssues)
      .innerJoin(schema.projects, issueProjectJoin)
      .$dynamic();

    if (needsPriorityJoin) {
      listQuery = listQuery
        .leftJoin(priorityColumns, priorityColumnJoin)
        .leftJoin(priorityValues, priorityValueJoin);
    }
    if (needsCountPriorityJoin) {
      countQuery = countQuery
        .leftJoin(priorityColumns, priorityColumnJoin)
        .leftJoin(priorityValues, priorityValueJoin);
    }

    const [rows, totalRow, summary] = await Promise.all([
      listQuery
        .where(where)
        .orderBy(...orderBy)
        .limit(query.limit)
        .offset(query.offset),
      countQuery.where(where),
      this.loadSummary(organizationId, accessibleProjectsWhere),
    ]);

    return {
      issues: rows.map((row) => ({
        id: row.id,
        number: row.number,
        identifier: row.identifier,
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
