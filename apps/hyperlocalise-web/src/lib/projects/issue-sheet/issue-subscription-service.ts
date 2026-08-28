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
import { and, asc, eq, inArray } from "drizzle-orm";

import { formatMemberDisplayName } from "@/api/routes/member/member.shared";
import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { ProjectServiceBase } from "@/lib/projects/project-service-base";

import { userHasIssueProjectAccess } from "./issue-sheet-assignee";

export type IssueSubscription = {
  issueId: string;
  userId: string;
  createdAt: string;
};

export type IssueSubscriber = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
};

export class IssueSubscriptionService extends ProjectServiceBase {
  constructor(database: typeof db = db) {
    super(database, "issue-subscription-service");
  }

  async subscribe(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    userId: string;
    requireProjectAccess?: boolean;
    database?: DatabaseClient;
  }): Promise<void> {
    const database = input.database ?? this.database;
    if (input.requireProjectAccess) {
      const hasAccess = await userHasIssueProjectAccess({
        organizationId: input.organizationId,
        projectId: input.projectId,
        userId: input.userId,
        database,
      });
      if (!hasAccess) {
        return;
      }
    }

    await database
      .insert(schema.issueSheetSubscriptions)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: input.issueId,
        userId: input.userId,
      })
      .onConflictDoNothing({
        target: [schema.issueSheetSubscriptions.issueId, schema.issueSheetSubscriptions.userId],
      });
  }

  async subscribeMany(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    userIds: Iterable<string>;
    requireProjectAccess?: boolean;
    database?: DatabaseClient;
  }): Promise<void> {
    const uniqueUserIds = [...new Set(input.userIds)].filter((userId) => userId.length > 0);
    if (uniqueUserIds.length === 0) {
      return;
    }

    const database = input.database ?? this.database;
    let targetUserIds = uniqueUserIds;

    if (input.requireProjectAccess) {
      const allowed: string[] = [];
      for (const userId of uniqueUserIds) {
        const hasAccess = await userHasIssueProjectAccess({
          organizationId: input.organizationId,
          projectId: input.projectId,
          userId,
          database,
        });
        if (hasAccess) {
          allowed.push(userId);
        }
      }
      targetUserIds = allowed;
    }

    if (targetUserIds.length === 0) {
      return;
    }

    await database
      .insert(schema.issueSheetSubscriptions)
      .values(
        targetUserIds.map((userId) => ({
          organizationId: input.organizationId,
          projectId: input.projectId,
          issueId: input.issueId,
          userId,
        })),
      )
      .onConflictDoNothing({
        target: [schema.issueSheetSubscriptions.issueId, schema.issueSheetSubscriptions.userId],
      });
  }

  async unsubscribe(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    userId: string;
    database?: DatabaseClient;
  }): Promise<void> {
    const database = input.database ?? this.database;
    await database
      .delete(schema.issueSheetSubscriptions)
      .where(
        and(
          eq(schema.issueSheetSubscriptions.organizationId, input.organizationId),
          eq(schema.issueSheetSubscriptions.projectId, input.projectId),
          eq(schema.issueSheetSubscriptions.issueId, input.issueId),
          eq(schema.issueSheetSubscriptions.userId, input.userId),
        ),
      );
  }

  async isSubscribed(input: {
    issueId: string;
    userId: string;
    database?: DatabaseClient;
  }): Promise<boolean> {
    const database = input.database ?? this.database;
    const [row] = await database
      .select({ id: schema.issueSheetSubscriptions.id })
      .from(schema.issueSheetSubscriptions)
      .where(
        and(
          eq(schema.issueSheetSubscriptions.issueId, input.issueId),
          eq(schema.issueSheetSubscriptions.userId, input.userId),
        ),
      )
      .limit(1);

    return Boolean(row);
  }

  async resolveWatchers(
    issueId: string,
    database: DatabaseClient = this.database,
  ): Promise<Set<string>> {
    const rows = await database
      .select({ userId: schema.issueSheetSubscriptions.userId })
      .from(schema.issueSheetSubscriptions)
      .where(eq(schema.issueSheetSubscriptions.issueId, issueId));

    return new Set(rows.map((row) => row.userId));
  }

  async getSubscription(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    userId: string;
    database?: DatabaseClient;
  }): Promise<IssueSubscription | null> {
    const database = input.database ?? this.database;
    const [row] = await database
      .select({
        issueId: schema.issueSheetSubscriptions.issueId,
        userId: schema.issueSheetSubscriptions.userId,
        createdAt: schema.issueSheetSubscriptions.createdAt,
      })
      .from(schema.issueSheetSubscriptions)
      .where(
        and(
          eq(schema.issueSheetSubscriptions.organizationId, input.organizationId),
          eq(schema.issueSheetSubscriptions.projectId, input.projectId),
          eq(schema.issueSheetSubscriptions.issueId, input.issueId),
          eq(schema.issueSheetSubscriptions.userId, input.userId),
        ),
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      issueId: row.issueId,
      userId: row.userId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listSubscribers(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    database?: DatabaseClient;
  }): Promise<IssueSubscriber[]> {
    const database = input.database ?? this.database;
    const rows = await database
      .select({
        userId: schema.issueSheetSubscriptions.userId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.issueSheetSubscriptions)
      .innerJoin(schema.users, eq(schema.issueSheetSubscriptions.userId, schema.users.id))
      .where(
        and(
          eq(schema.issueSheetSubscriptions.organizationId, input.organizationId),
          eq(schema.issueSheetSubscriptions.projectId, input.projectId),
          eq(schema.issueSheetSubscriptions.issueId, input.issueId),
        ),
      )
      .orderBy(asc(schema.issueSheetSubscriptions.createdAt));

    return rows.map((row) => ({
      userId: row.userId,
      displayName: formatMemberDisplayName(row),
      avatarUrl: row.avatarUrl,
    }));
  }

  async subscribedUserIdsForIssues(
    issueIds: string[],
    userId: string,
    database: DatabaseClient = this.database,
  ): Promise<Set<string>> {
    if (issueIds.length === 0) {
      return new Set();
    }

    const rows = await database
      .select({ issueId: schema.issueSheetSubscriptions.issueId })
      .from(schema.issueSheetSubscriptions)
      .where(
        and(
          eq(schema.issueSheetSubscriptions.userId, userId),
          inArray(schema.issueSheetSubscriptions.issueId, issueIds),
        ),
      );

    return new Set(rows.map((row) => row.issueId));
  }
}

export const issueSubscriptionService = new IssueSubscriptionService();
