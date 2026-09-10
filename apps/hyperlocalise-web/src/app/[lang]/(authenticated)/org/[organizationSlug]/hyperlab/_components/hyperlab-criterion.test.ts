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
import { expect, test } from "vite-plus/test";

import {
  criterionToRuleGroup,
  ruleGroupToCriterion,
  summarizeCriterion,
} from "./hyperlab-criterion";

test("drops empty rules when saving an audience", () => {
  expect(
    ruleGroupToCriterion({
      type: "and",
      rules: [
        { type: "attribute", name: "country", match: "exact", value: "JP" },
        { type: "attribute", name: "", match: "exact", value: "" },
      ],
      nested: [],
    }),
  ).toEqual({
    type: "attribute",
    name: "country",
    match: "exact",
    value: "JP",
  });
});

test("returns null for a blank audience", () => {
  expect(ruleGroupToCriterion({ type: "or", rules: [], nested: [] })).toBeNull();
});

test("summarizes a marketer-readable audience", () => {
  const criterion = {
    type: "and" as const,
    children: [
      { type: "attribute" as const, name: "country", match: "exact" as const, value: "JP" },
      { type: "attribute" as const, name: "plan", match: "exact" as const, value: "pro" },
    ],
  };
  expect(summarizeCriterion(criterion)).toBe("Country is JP and Plan is pro");
  expect(criterionToRuleGroup(criterion).rules).toHaveLength(2);
});

test("round-trips nested audience groups without dropping them", () => {
  const criterion = {
    type: "and" as const,
    children: [
      { type: "attribute" as const, name: "country", match: "exact" as const, value: "JP" },
      {
        type: "or" as const,
        children: [
          { type: "attribute" as const, name: "plan", match: "exact" as const, value: "pro" },
          { type: "attribute" as const, name: "plan", match: "exact" as const, value: "ent" },
        ],
      },
    ],
  };
  const group = criterionToRuleGroup(criterion);
  expect(group.rules).toHaveLength(1);
  expect(group.nested).toHaveLength(1);
  expect(ruleGroupToCriterion(group)).toEqual(criterion);
  expect(summarizeCriterion(criterion)).toBe("Country is JP and (Plan is pro or Plan is ent)");
});

test("round-trips a not root without rewriting it", () => {
  const criterion = {
    type: "not" as const,
    children: [{ type: "attribute" as const, name: "country", match: "exact" as const, value: "US" }],
  };
  expect(ruleGroupToCriterion(criterionToRuleGroup(criterion))).toEqual(criterion);
  expect(summarizeCriterion(criterion)).toBe("not Country is US");
});
