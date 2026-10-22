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
import { describe, expect, it, vi } from "vite-plus/test";

import type { VisualAssignmentRule } from "../schema/types";

vi.mock("@/lib/database/client", () => ({ db: {}, schema: {} }));
vi.mock("@/lib/file-storage/records", () => ({
  getRepositorySourceFileVersionForStoredFile: vi.fn(),
}));
const loadCrowdinAssignees = vi.fn();
vi.mock("./crowdin-actions", () => ({ loadCrowdinAssignees }));

const {
  assignmentRuleMatches,
  findAssignmentRule,
  leastBusy,
  nextInRotation,
  normalizeJobType,
  readAssignmentAttributes,
  runPickAssigneeAction,
} = await import("./assignment-actions");

const NOW = new Date("2026-05-01T00:00:00Z");

function rule(overrides: Partial<VisualAssignmentRule> = {}): VisualAssignmentRule {
  return {
    id: "rule",
    name: "",
    locales: "",
    jobTypes: [],
    assigneeIds: ["user_a"],
    ...overrides,
  };
}

function work(input: { locale?: unknown; jobType?: string; size?: unknown; dueAt?: string }) {
  return readAssignmentAttributes({
    locale: input.locale ?? "",
    jobType: input.jobType ?? "",
    size: input.size ?? "",
    dueAt: input.dueAt ?? "",
  });
}

describe("normalizeJobType", () => {
  it("reads the names people and other systems use", () => {
    expect(normalizeJobType("MTPE")).toBe("edit");
    expect(normalizeJobType("post-edit")).toBe("edit");
    expect(normalizeJobType("review")).toBe("proofread");
    expect(normalizeJobType("Translation")).toBe("translate");
    expect(normalizeJobType("dubbing")).toBeNull();
  });
});

describe("assignmentRuleMatches", () => {
  it("matches anything when the rule sets no condition", () => {
    expect(assignmentRuleMatches(rule(), work({}), NOW)).toBe(true);
  });

  it("lets a language cover its regions but not other languages", () => {
    const french = rule({ locales: "fr" });
    expect(assignmentRuleMatches(french, work({ locale: "fr-CA" }), NOW)).toBe(true);
    expect(assignmentRuleMatches(french, work({ locale: "FR" }), NOW)).toBe(true);
    expect(assignmentRuleMatches(french, work({ locale: "fy-NL" }), NOW)).toBe(false);
    expect(assignmentRuleMatches(french, work({}), NOW)).toBe(false);
  });

  it("needs every locale of a job in many locales covered", () => {
    const european = rule({ locales: "fr, de-DE" });
    expect(assignmentRuleMatches(european, work({ locale: ["fr-FR", "de-DE"] }), NOW)).toBe(true);
    expect(assignmentRuleMatches(european, work({ locale: "fr-FR, ja-JP" }), NOW)).toBe(false);
  });

  it("filters on job type", () => {
    const reviewers = rule({ jobTypes: ["proofread"] });
    expect(assignmentRuleMatches(reviewers, work({ jobType: "review" }), NOW)).toBe(true);
    expect(assignmentRuleMatches(reviewers, work({ jobType: "translate" }), NOW)).toBe(false);
    expect(assignmentRuleMatches(reviewers, work({}), NOW)).toBe(false);
  });

  it("bounds size inclusively and refuses work without a size", () => {
    const small = rule({ minSize: 10, maxSize: 500 });
    expect(assignmentRuleMatches(small, work({ size: 10 }), NOW)).toBe(true);
    expect(assignmentRuleMatches(small, work({ size: "500" }), NOW)).toBe(true);
    expect(assignmentRuleMatches(small, work({ size: 501 }), NOW)).toBe(false);
    expect(assignmentRuleMatches(small, work({}), NOW)).toBe(false);
  });

  it("takes work due within the window or overdue, never undated work", () => {
    const urgent = rule({ dueWithinHours: 24 });
    expect(assignmentRuleMatches(urgent, work({ dueAt: "2026-05-01T23:00:00Z" }), NOW)).toBe(true);
    expect(assignmentRuleMatches(urgent, work({ dueAt: "2026-04-30T00:00:00Z" }), NOW)).toBe(true);
    expect(assignmentRuleMatches(urgent, work({ dueAt: "2026-05-03T00:00:00Z" }), NOW)).toBe(false);
    expect(assignmentRuleMatches(urgent, work({}), NOW)).toBe(false);
  });
});

describe("findAssignmentRule", () => {
  it("returns the first rule that applies, numbered from 1", () => {
    const rules = [
      rule({ id: "urgent", dueWithinHours: 4 }),
      rule({ id: "french", locales: "fr" }),
      rule({ id: "anyone" }),
    ];
    expect(findAssignmentRule(rules, work({ locale: "fr-FR" }), NOW)).toMatchObject({
      rule: { id: "french" },
      number: 2,
    });
    expect(findAssignmentRule(rules.slice(0, 2), work({ locale: "ja" }), NOW)).toBeNull();
  });
});

describe("strategies", () => {
  it("rotates to the person after the last pick and wraps around", () => {
    const pool = ["a", "b", "c"];
    expect(nextInRotation(pool, null)).toBe("a");
    expect(nextInRotation(pool, "a")).toBe("b");
    expect(nextInRotation(pool, "c")).toBe("a");
    expect(nextInRotation(pool, "removed")).toBe("a");
  });

  it("picks the fewest open jobs, ties going to the first listed", () => {
    expect(
      leastBusy(
        ["a", "b", "c"],
        new Map([
          ["a", 3],
          ["b", 1],
          ["c", 1],
        ]),
      ),
    ).toBe("b");
    expect(leastBusy(["a", "b"], new Map())).toBe("a");
  });
});

describe("runPickAssigneeAction with Crowdin people", () => {
  const base = {
    organizationId: "org_1",
    nodeId: "pick",
    locale: "fr-FR",
    jobType: "",
    size: "",
    dueAt: "",
    fallbackAssigneeIds: [],
    peopleSource: "crowdin" as const,
    crowdinProjectId: "42",
    workosUserId: "user_owner",
    now: NOW,
  };

  it("gives the work to the project member with the fewest open Crowdin tasks", async () => {
    loadCrowdinAssignees.mockResolvedValueOnce({
      ok: true,
      assignees: new Map([
        ["12", { name: "Amélie", email: "", openTasks: 4 }],
        ["14", { name: "Bruno", email: "", openTasks: 1 }],
      ]),
    });

    const result = await runPickAssigneeAction({
      ...base,
      rules: [rule({ locales: "fr", assigneeIds: ["12", "14", "99"] })],
      strategy: "least_busy",
    });

    expect(loadCrowdinAssignees).toHaveBeenCalledWith(
      expect.objectContaining({ crowdinProjectId: "42", assigneeIds: ["12", "14", "99"] }),
    );
    expect(result).toEqual({
      ok: true,
      output: expect.objectContaining({
        assigneeId: "14",
        assigneeName: "Bruno",
        openJobs: 1,
        candidates: ["12", "14"],
      }),
    });
  });

  it("fails when nobody listed is still in the Crowdin project", async () => {
    loadCrowdinAssignees.mockResolvedValueOnce({ ok: true, assignees: new Map() });

    const result = await runPickAssigneeAction({
      ...base,
      rules: [rule({ assigneeIds: ["12"] })],
      strategy: "first",
    });

    expect(result).toMatchObject({ ok: false, error: { code: "no_available_assignee" } });
  });
});
