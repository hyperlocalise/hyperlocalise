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
import type {
  IssueRoutingRecipeConditions,
  IssueRoutingRecipeActions,
} from "@/lib/database/schema/issue-sheet";

export type IssueRoutingRecipeMatchSnapshot = {
  issueType: string;
  targetLocale: string | null;
  priority: string | null;
};

export type IssueRoutingRecipeRow = {
  id: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  conditions: IssueRoutingRecipeConditions;
  actions: IssueRoutingRecipeActions;
};

export function issueRoutingRecipeMatches(
  recipe: IssueRoutingRecipeRow,
  snapshot: IssueRoutingRecipeMatchSnapshot,
): boolean {
  if (!recipe.enabled) {
    return false;
  }

  const conditions = recipe.conditions ?? {};

  if (conditions.issueTypes?.length) {
    if (!conditions.issueTypes.includes(snapshot.issueType)) {
      return false;
    }
  }

  if (conditions.targetLocales?.length) {
    if (!snapshot.targetLocale || !conditions.targetLocales.includes(snapshot.targetLocale)) {
      return false;
    }
  }

  if (conditions.priorities?.length) {
    if (!snapshot.priority || !conditions.priorities.includes(snapshot.priority)) {
      return false;
    }
  }

  return true;
}

export function findFirstMatchingIssueRoutingRecipe(
  recipes: IssueRoutingRecipeRow[],
  snapshot: IssueRoutingRecipeMatchSnapshot,
): IssueRoutingRecipeRow | null {
  const ordered = [...recipes].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
  for (const recipe of ordered) {
    if (issueRoutingRecipeMatches(recipe, snapshot)) {
      return recipe;
    }
  }
  return null;
}

export type IssueRoutingRecipePreviewResult = {
  matchedRecipe: IssueRoutingRecipeRow | null;
  wouldAssignUserId: string | null;
  wouldSetPriority: string | null;
  skippedAssignBecauseSet: boolean;
  skippedPriorityBecauseSet: boolean;
};

export function previewIssueRoutingRecipe(
  recipes: IssueRoutingRecipeRow[],
  snapshot: IssueRoutingRecipeMatchSnapshot,
  input: { assigneeAlreadySet: boolean; priorityAlreadySet: boolean },
): IssueRoutingRecipePreviewResult {
  const matchedRecipe = findFirstMatchingIssueRoutingRecipe(recipes, snapshot);
  if (!matchedRecipe) {
    return {
      matchedRecipe: null,
      wouldAssignUserId: null,
      wouldSetPriority: null,
      skippedAssignBecauseSet: false,
      skippedPriorityBecauseSet: false,
    };
  }

  const skippedAssignBecauseSet =
    Boolean(matchedRecipe.actions.assigneeUserId) && input.assigneeAlreadySet;
  const skippedPriorityBecauseSet =
    Boolean(matchedRecipe.actions.priority) && input.priorityAlreadySet;

  return {
    matchedRecipe,
    wouldAssignUserId: skippedAssignBecauseSet
      ? null
      : (matchedRecipe.actions.assigneeUserId ?? null),
    wouldSetPriority: skippedPriorityBecauseSet ? null : (matchedRecipe.actions.priority ?? null),
    skippedAssignBecauseSet,
    skippedPriorityBecauseSet,
  };
}
