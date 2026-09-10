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
  ExperimentCriterionAttributeNode,
  ExperimentCriterionMatch,
  ExperimentCriterionNode,
} from "@/lib/database/schema/experiments";

export const HYPERLAB_ATTRIBUTE_PRESETS = [
  { name: "country", label: "Country" },
  { name: "locale", label: "Language" },
  { name: "region", label: "Region" },
  { name: "plan", label: "Plan" },
  { name: "device", label: "Device" },
  { name: "utm_source", label: "Traffic source" },
  { name: "utm_campaign", label: "Campaign name" },
] as const;

export const HYPERLAB_MATCH_OPTIONS: Array<{
  value: ExperimentCriterionMatch;
  label: string;
  needsValue: boolean;
  multi: boolean;
}> = [
  { value: "exact", label: "is", needsValue: true, multi: false },
  { value: "contains_substring", label: "contains", needsValue: true, multi: false },
  { value: "in", label: "is one of", needsValue: true, multi: true },
  { value: "gt", label: "is greater than", needsValue: true, multi: false },
  { value: "gte", label: "is at least", needsValue: true, multi: false },
  { value: "lt", label: "is less than", needsValue: true, multi: false },
  { value: "lte", label: "is at most", needsValue: true, multi: false },
  { value: "is_null", label: "is empty", needsValue: false, multi: false },
  { value: "is_not_null", label: "is not empty", needsValue: false, multi: false },
];

export type HyperlabRuleGroup = {
  type: "and" | "or";
  rules: ExperimentCriterionAttributeNode[];
};

export function emptyAttributeRule(): ExperimentCriterionAttributeNode {
  return {
    type: "attribute",
    name: "country",
    match: "exact",
    value: "",
  };
}

export function criterionToRuleGroup(criterion: unknown): HyperlabRuleGroup {
  if (!criterion || typeof criterion !== "object") {
    return { type: "or", rules: [] };
  }
  const node = criterion as ExperimentCriterionNode;
  if (node.type === "attribute") {
    return { type: "or", rules: [node] };
  }
  if (node.type === "and" || node.type === "or") {
    return {
      type: node.type,
      rules: node.children.filter(
        (child): child is ExperimentCriterionAttributeNode => child.type === "attribute",
      ),
    };
  }
  return { type: "or", rules: [] };
}

export function ruleGroupToCriterion(group: HyperlabRuleGroup): ExperimentCriterionNode | null {
  const rules = group.rules
    .map(normalizeAttributeRule)
    .filter((rule): rule is ExperimentCriterionAttributeNode => rule !== null);
  if (rules.length === 0) {
    return null;
  }
  if (rules.length === 1) {
    return rules[0];
  }
  return { type: group.type, children: rules };
}

function normalizeAttributeRule(
  rule: ExperimentCriterionAttributeNode,
): ExperimentCriterionAttributeNode | null {
  const name = rule.name.trim();
  if (!name) {
    return null;
  }
  if (rule.match === "is_null" || rule.match === "is_not_null") {
    return { type: "attribute", name, match: rule.match };
  }
  if (
    rule.match === "in" ||
    rule.match === "contains_any" ||
    rule.match === "contains_substring_any"
  ) {
    const values = Array.isArray(rule.value)
      ? rule.value.map((value) => value.trim()).filter(Boolean)
      : String(rule.value ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
    if (values.length === 0) {
      return null;
    }
    return { type: "attribute", name, match: rule.match, value: values };
  }
  if (rule.value === undefined || rule.value === "") {
    return null;
  }
  return { type: "attribute", name, match: rule.match, value: rule.value };
}

export function attributeValueToInput(rule: ExperimentCriterionAttributeNode): string {
  if (Array.isArray(rule.value)) {
    return rule.value.join(", ");
  }
  if (rule.value === undefined || rule.value === null) {
    return "";
  }
  return String(rule.value);
}

export function summarizeCriterion(criterion: unknown): string {
  const group = criterionToRuleGroup(criterion);
  if (group.rules.length === 0) {
    return "";
  }
  const joiner = group.type === "and" ? " and " : " or ";
  return group.rules
    .map((rule) => {
      const preset = HYPERLAB_ATTRIBUTE_PRESETS.find((item) => item.name === rule.name);
      const name = preset?.label ?? rule.name;
      const match =
        HYPERLAB_MATCH_OPTIONS.find((item) => item.value === rule.match)?.label ?? rule.match;
      const value = attributeValueToInput(rule);
      return value ? `${name} ${match} ${value}` : `${name} ${match}`;
    })
    .join(joiner);
}
