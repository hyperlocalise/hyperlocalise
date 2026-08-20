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
import { and, desc, eq } from "drizzle-orm";

import type { IssueSheetRoutingRecipesBody } from "@/api/routes/project/issue-sheet.schema";
import { db, schema, type DatabaseClient } from "@/lib/database";
import { filterAssignableAssigneeUserIds } from "./issue-sheet-assignee";
import {
  previewIssueRoutingRecipe,
  type IssueRoutingRecipeMatchSnapshot,
  type IssueRoutingRecipeRow,
} from "./issue-routing-recipe-matcher";

export type IssueRoutingRecipe = {
  id: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  conditions: IssueRoutingRecipeRow["conditions"];
  actions: IssueRoutingRecipeRow["actions"];
  assigneeAssignable: boolean | null;
};

export type IssueRoutingFailure = {
  id: string;
  issueId: string;
  recipeId: string | null;
  errorCode: string;
  message: string | null;
  createdAt: string;
};

function mapRecipeRow(
  row: {
    id: string;
    name: string;
    enabled: boolean;
    sortOrder: number;
    conditions: IssueRoutingRecipeRow["conditions"];
    actions: IssueRoutingRecipeRow["actions"];
  },
  assignableUserIds: Set<string>,
): IssueRoutingRecipe {
  const assigneeUserId = row.actions.assigneeUserId;
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    conditions: row.conditions ?? {},
    actions: row.actions ?? {},
    assigneeAssignable: assigneeUserId ? assignableUserIds.has(assigneeUserId) : null,
  };
}

export class IssueRoutingRecipeService {
  constructor(private readonly database: DatabaseClient = db) {}

  async listRecipes(input: {
    organizationId: string;
    projectId: string;
  }): Promise<IssueRoutingRecipe[]> {
    const rows = await this.database
      .select({
        id: schema.issueSheetRoutingRecipes.id,
        name: schema.issueSheetRoutingRecipes.name,
        enabled: schema.issueSheetRoutingRecipes.enabled,
        sortOrder: schema.issueSheetRoutingRecipes.sortOrder,
        conditions: schema.issueSheetRoutingRecipes.conditions,
        actions: schema.issueSheetRoutingRecipes.actions,
      })
      .from(schema.issueSheetRoutingRecipes)
      .where(
        and(
          eq(schema.issueSheetRoutingRecipes.organizationId, input.organizationId),
          eq(schema.issueSheetRoutingRecipes.projectId, input.projectId),
        ),
      )
      .orderBy(schema.issueSheetRoutingRecipes.sortOrder, schema.issueSheetRoutingRecipes.id);

    const assigneeUserIds = rows
      .map((row) => row.actions?.assigneeUserId)
      .filter((userId): userId is string => Boolean(userId));

    const assignableUserIds = await filterAssignableAssigneeUserIds({
      organizationId: input.organizationId,
      projectId: input.projectId,
      userIds: assigneeUserIds,
      database: this.database,
    });

    return rows.map((row) => mapRecipeRow(row, assignableUserIds));
  }

  async setRecipes(input: {
    organizationId: string;
    projectId: string;
    body: IssueSheetRoutingRecipesBody;
  }): Promise<IssueRoutingRecipe[]> {
    const assigneeUserIds = input.body.recipes
      .map((recipe) => recipe.actions.assigneeUserId)
      .filter((userId): userId is string => Boolean(userId));

    if (assigneeUserIds.length > 0) {
      const assignableUserIds = await filterAssignableAssigneeUserIds({
        organizationId: input.organizationId,
        projectId: input.projectId,
        userIds: assigneeUserIds,
        database: this.database,
      });
      for (const userId of assigneeUserIds) {
        if (!assignableUserIds.has(userId)) {
          throw new Error("assignee_not_assignable");
        }
      }
    }

    await this.database.transaction(async (tx) => {
      await tx
        .delete(schema.issueSheetRoutingRecipes)
        .where(
          and(
            eq(schema.issueSheetRoutingRecipes.organizationId, input.organizationId),
            eq(schema.issueSheetRoutingRecipes.projectId, input.projectId),
          ),
        );

      if (input.body.recipes.length === 0) {
        return;
      }

      await tx.insert(schema.issueSheetRoutingRecipes).values(
        input.body.recipes.map((recipe, index) => ({
          organizationId: input.organizationId,
          projectId: input.projectId,
          name: recipe.name,
          enabled: recipe.enabled,
          sortOrder: recipe.sortOrder ?? index,
          conditions: recipe.conditions ?? {},
          actions: recipe.actions,
        })),
      );
    });

    return this.listRecipes({
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
  }

  async listFailures(input: {
    organizationId: string;
    projectId: string;
    limit?: number;
  }): Promise<IssueRoutingFailure[]> {
    const limit = input.limit ?? 50;
    const rows = await this.database
      .select({
        id: schema.issueSheetRoutingFailures.id,
        issueId: schema.issueSheetRoutingFailures.issueId,
        recipeId: schema.issueSheetRoutingFailures.recipeId,
        errorCode: schema.issueSheetRoutingFailures.errorCode,
        message: schema.issueSheetRoutingFailures.message,
        createdAt: schema.issueSheetRoutingFailures.createdAt,
      })
      .from(schema.issueSheetRoutingFailures)
      .where(
        and(
          eq(schema.issueSheetRoutingFailures.organizationId, input.organizationId),
          eq(schema.issueSheetRoutingFailures.projectId, input.projectId),
        ),
      )
      .orderBy(desc(schema.issueSheetRoutingFailures.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      issueId: row.issueId,
      recipeId: row.recipeId,
      errorCode: row.errorCode,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async preview(input: {
    organizationId: string;
    projectId: string;
    snapshot: IssueRoutingRecipeMatchSnapshot;
    assigneeAlreadySet: boolean;
    priorityAlreadySet: boolean;
  }) {
    const recipes = await this.listRecipeRows({
      organizationId: input.organizationId,
      projectId: input.projectId,
    });

    const preview = previewIssueRoutingRecipe(recipes, input.snapshot, {
      assigneeAlreadySet: input.assigneeAlreadySet,
      priorityAlreadySet: input.priorityAlreadySet,
    });

    let wouldAssignDisplayName: string | null = null;
    if (preview.wouldAssignUserId) {
      const assignable = await filterAssignableAssigneeUserIds({
        organizationId: input.organizationId,
        projectId: input.projectId,
        userIds: [preview.wouldAssignUserId],
        database: this.database,
      });
      if (!assignable.has(preview.wouldAssignUserId)) {
        return {
          ...preview,
          matchedRecipe: preview.matchedRecipe,
          wouldAssignUserId: preview.wouldAssignUserId,
          wouldAssignDisplayName: null,
          assigneeNotAssignable: true,
        };
      }

      const [user] = await this.database
        .select({
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          email: schema.users.email,
        })
        .from(schema.users)
        .where(eq(schema.users.id, preview.wouldAssignUserId))
        .limit(1);

      if (user) {
        const parts = [user.firstName, user.lastName].filter(Boolean);
        wouldAssignDisplayName = parts.length > 0 ? parts.join(" ") : user.email;
      }
    }

    return {
      matchedRecipe: preview.matchedRecipe
        ? {
            id: preview.matchedRecipe.id,
            name: preview.matchedRecipe.name,
            enabled: preview.matchedRecipe.enabled,
            sortOrder: preview.matchedRecipe.sortOrder,
            conditions: preview.matchedRecipe.conditions,
            actions: preview.matchedRecipe.actions,
          }
        : null,
      wouldAssignUserId: preview.wouldAssignUserId,
      wouldAssignDisplayName,
      wouldSetPriority: preview.wouldSetPriority,
      skippedAssignBecauseSet: preview.skippedAssignBecauseSet,
      skippedPriorityBecauseSet: preview.skippedPriorityBecauseSet,
      assigneeNotAssignable: false,
    };
  }

  async listRecipeRows(input: { organizationId: string; projectId: string }) {
    return this.database
      .select({
        id: schema.issueSheetRoutingRecipes.id,
        name: schema.issueSheetRoutingRecipes.name,
        enabled: schema.issueSheetRoutingRecipes.enabled,
        sortOrder: schema.issueSheetRoutingRecipes.sortOrder,
        conditions: schema.issueSheetRoutingRecipes.conditions,
        actions: schema.issueSheetRoutingRecipes.actions,
      })
      .from(schema.issueSheetRoutingRecipes)
      .where(
        and(
          eq(schema.issueSheetRoutingRecipes.organizationId, input.organizationId),
          eq(schema.issueSheetRoutingRecipes.projectId, input.projectId),
        ),
      )
      .orderBy(schema.issueSheetRoutingRecipes.sortOrder, schema.issueSheetRoutingRecipes.id);
  }

  async logFailure(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    recipeId: string | null;
    errorCode: string;
    message?: string;
    database?: DatabaseClient;
  }) {
    const database = input.database ?? this.database;
    await database.insert(schema.issueSheetRoutingFailures).values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      recipeId: input.recipeId,
      errorCode: input.errorCode,
      message: input.message ?? null,
    });
  }

  async validateAssignee(input: {
    organizationId: string;
    projectId: string;
    assigneeUserId: string;
  }): Promise<boolean> {
    const assignable = await filterAssignableAssigneeUserIds({
      organizationId: input.organizationId,
      projectId: input.projectId,
      userIds: [input.assigneeUserId],
      database: this.database,
    });
    return assignable.has(input.assigneeUserId);
  }
}

export const issueRoutingRecipeService = new IssueRoutingRecipeService();
