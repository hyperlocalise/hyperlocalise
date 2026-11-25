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

import { createDefaultConfig } from "../catalog/node-catalog";
import { resolveWorkflowDueAt } from "../runtime/localization-actions";
import type { VisualNodeConfig, VisualWorkflowV3Definition } from "../schema/types";
import { validateVisualWorkflowV3Definition } from "./validate-workflow-v3";

function workflowWith(
  trigger: VisualNodeConfig,
  step?: VisualNodeConfig,
): VisualWorkflowV3Definition {
  return {
    schemaVersion: 3,
    name: "Checks",
    nodes: [
      { id: "trigger", type: trigger.kind, config: trigger },
      ...(step ? [{ id: "step", type: step.kind, config: step }] : []),
    ],
    edges: step
      ? [
          {
            id: "e",
            kind: "execution",
            source: "trigger",
            target: "step",
            sourcePortId: "success",
            targetPortId: "input",
          },
        ]
      : [],
    editor: { positions: {} },
  } as VisualWorkflowV3Definition;
}

const issuesOf = (definition: VisualWorkflowV3Definition) =>
  validateVisualWorkflowV3Definition(definition).map((issue) => [
    issue.code,
    issue.nodeId,
    issue.field,
    issue.reason,
  ]);

describe("publish checks for localisation steps", () => {
  it("asks for people on a Pick assignee with nobody to pick from", () => {
    const empty = createDefaultConfig("action.pick_assignee");
    expect(issuesOf(workflowWith({ kind: "trigger.manual" }, empty))).toContainEqual([
      "invalid_node_config",
      "step",
      "rules",
      "required",
    ]);

    const withFallback = { ...empty, fallbackAssigneeIds: ["user_1"] } as VisualNodeConfig;
    expect(issuesOf(workflowWith({ kind: "trigger.manual" }, withFallback))).toEqual([]);
  });

  it("reports a Source upload path pattern that cannot be used", () => {
    const trigger = (pathPatterns: string[], pathSyntax?: "regex"): VisualNodeConfig => ({
      kind: "trigger.source_upload",
      pathPatterns,
      ...(pathSyntax ? { pathSyntax } : {}),
    });

    expect(issuesOf(workflowWith(trigger(["**/*.json"])))).toEqual([]);
    expect(issuesOf(workflowWith(trigger(["(unclosed"], "regex")))).toEqual([
      ["invalid_trigger_config", "trigger", "pathPatterns", "invalid"],
    ]);
  });

  it("asks for a Slack channel at publish, not when the draft is saved", () => {
    const slack = {
      ...createDefaultConfig("action.notify_slack"),
      message: "Hi",
    } as VisualNodeConfig;
    expect(issuesOf(workflowWith({ kind: "trigger.manual" }, slack))).toEqual([
      ["invalid_node_config", "step", "channelId", "required"],
    ]);
  });
});

describe("resolveWorkflowDueAt", () => {
  const now = new Date("2026-05-01T00:00:00.000Z");

  it("prefers the due date it was given", () => {
    expect(resolveWorkflowDueAt({ dueAt: "2026-06-01T17:00:00Z", dueInHours: 48, now })).toEqual(
      new Date("2026-06-01T17:00:00Z"),
    );
  });

  it("counts hours from when the step runs when no date is given", () => {
    expect(resolveWorkflowDueAt({ dueAt: "", dueInHours: 48, now })).toEqual(
      new Date("2026-05-03T00:00:00.000Z"),
    );
  });

  it("has no due date without either, and rejects one that is not a date", () => {
    expect(resolveWorkflowDueAt({ now })).toBeNull();
    expect(resolveWorkflowDueAt({ dueAt: "soon", dueInHours: 4, now })).toBeUndefined();
  });
});
