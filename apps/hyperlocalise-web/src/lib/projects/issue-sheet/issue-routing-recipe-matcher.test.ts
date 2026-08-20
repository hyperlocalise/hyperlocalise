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
import { describe, expect, it } from "vite-plus/test";

import {
  findFirstMatchingIssueRoutingRecipe,
  issueRoutingRecipeMatches,
  previewIssueRoutingRecipe,
  type IssueRoutingRecipeRow,
} from "./issue-routing-recipe-matcher";

function recipe(
  partial: Partial<IssueRoutingRecipeRow> & Pick<IssueRoutingRecipeRow, "id" | "name">,
): IssueRoutingRecipeRow {
  return {
    enabled: true,
    sortOrder: 0,
    conditions: {},
    actions: {},
    ...partial,
  };
}

describe("issueRoutingRecipeMatches", () => {
  it("matches when all configured dimensions align", () => {
    const row = recipe({
      id: "r1",
      name: "QA French",
      conditions: {
        issueTypes: ["qa_failure"],
        targetLocales: ["fr-FR"],
        priorities: ["P1"],
      },
    });

    expect(
      issueRoutingRecipeMatches(row, {
        issueType: "qa_failure",
        targetLocale: "fr-FR",
        priority: "P1",
      }),
    ).toBe(true);
  });

  it("treats unset condition dimensions as any", () => {
    const row = recipe({
      id: "r1",
      name: "Any locale",
      conditions: { issueTypes: ["qa_failure"] },
    });

    expect(
      issueRoutingRecipeMatches(row, {
        issueType: "qa_failure",
        targetLocale: "de-DE",
        priority: null,
      }),
    ).toBe(true);
  });

  it("returns false for disabled recipes", () => {
    const row = recipe({
      id: "r1",
      name: "Disabled",
      enabled: false,
      conditions: { issueTypes: ["qa_failure"] },
    });

    expect(
      issueRoutingRecipeMatches(row, {
        issueType: "qa_failure",
        targetLocale: null,
        priority: null,
      }),
    ).toBe(false);
  });
});

describe("findFirstMatchingIssueRoutingRecipe", () => {
  it("returns the first enabled recipe by sortOrder when multiple match", () => {
    const recipes = [
      recipe({
        id: "second",
        name: "Second",
        sortOrder: 1,
        conditions: { issueTypes: ["qa_failure"] },
        actions: { priority: "P2" },
      }),
      recipe({
        id: "first",
        name: "First",
        sortOrder: 0,
        conditions: { issueTypes: ["qa_failure"] },
        actions: { priority: "P0" },
      }),
    ];

    const matched = findFirstMatchingIssueRoutingRecipe(recipes, {
      issueType: "qa_failure",
      targetLocale: null,
      priority: null,
    });

    expect(matched?.id).toBe("first");
  });
});

describe("previewIssueRoutingRecipe", () => {
  it("skips actions already set on create", () => {
    const recipes = [
      recipe({
        id: "r1",
        name: "Assign and prioritize",
        conditions: { issueTypes: ["qa_failure"] },
        actions: { assigneeUserId: "user-1", priority: "P1" },
      }),
    ];

    const preview = previewIssueRoutingRecipe(
      recipes,
      { issueType: "qa_failure", targetLocale: null, priority: "P0" },
      { assigneeAlreadySet: true, priorityAlreadySet: true },
    );

    expect(preview.matchedRecipe?.id).toBe("r1");
    expect(preview.wouldAssignUserId).toBeNull();
    expect(preview.wouldSetPriority).toBeNull();
    expect(preview.skippedAssignBecauseSet).toBe(true);
    expect(preview.skippedPriorityBecauseSet).toBe(true);
  });
});
