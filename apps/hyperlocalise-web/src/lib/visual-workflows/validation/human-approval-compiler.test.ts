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

import type { VisualWorkflowV3Definition } from "../schema/types";
import { compileVisualWorkflowV3Definition } from "./compile-workflow-v3";

function workflow(
  approval: VisualWorkflowV3Definition["nodes"][number],
  edges: VisualWorkflowV3Definition["edges"] = [],
): VisualWorkflowV3Definition {
  return {
    schemaVersion: 3,
    name: "Human approval compiler",
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        config: { kind: "trigger.manual" },
      },
      approval,
      {
        id: "next",
        type: "logic.set",
        config: {
          kind: "logic.set",
          assignments: [],
        },
      },
    ],
    edges,
    editor: {
      positions: {
        trigger: { x: 0, y: 0 },
        approval: { x: 240, y: 0 },
        next: { x: 480, y: 0 },
      },
    },
  };
}

describe("Human Approval compiler", () => {
  it.each(["approved", "rejected", "changes_requested", "timed_out"] as const)(
    "accepts the %s execution branch",
    (sourcePortId) => {
      const result = compileVisualWorkflowV3Definition(
        workflow(
          {
            id: "approval",
            type: "flow.human_approval",
            config: {
              kind: "flow.human_approval",
              reviewerType: "team",
              reviewerId: "team_reviewers",
              prompt: "Review the translated artifact",
              deadline: "2026-11-01T09:00:00.000Z",
            },
          },
          [
            {
              id: `approval-${sourcePortId}`,
              kind: "execution",
              source: "approval",
              target: "next",
              sourcePortId,
              targetPortId: "input",
            },
          ],
        ),
      );

      expect(result.issues).toEqual([]);
      expect(result.executionEdges).toHaveLength(1);
    },
  );

  it("requires reviewer, prompt, and deadline", () => {
    const result = compileVisualWorkflowV3Definition(
      workflow({
        id: "approval",
        type: "flow.human_approval",
        config: {
          kind: "flow.human_approval",
          reviewerType: "user",
          reviewerId: "",
          prompt: "",
        },
      }),
    );

    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          code: "missing_required_input",
          nodeId: "approval",
          field: "reviewerId",
          reason: "required",
        },
        {
          code: "missing_required_input",
          nodeId: "approval",
          field: "prompt",
          reason: "required",
        },
        {
          code: "missing_required_input",
          nodeId: "approval",
          field: "deadline",
          reason: "required",
        },
      ]),
    );
  });

  it("accepts required values supplied through bindings", () => {
    const result = compileVisualWorkflowV3Definition(
      workflow({
        id: "approval",
        type: "flow.human_approval",
        config: {
          kind: "flow.human_approval",
          reviewerType: "user",
          reviewerId: "",
          prompt: "",
        },
        inputs: {
          reviewerId: {
            kind: "literal",
            value: "user_123",
          },
          prompt: {
            kind: "template",
            template: "Review {{trigger.artifactName}}",
          },
          deadline: {
            kind: "literal",
            value: "2026-11-01T09:00:00.000Z",
          },
        },
      }),
    );

    expect(result.issues).toEqual([]);
  });

  it("rejects incompatible literal bindings", () => {
    const result = compileVisualWorkflowV3Definition(
      workflow({
        id: "approval",
        type: "flow.human_approval",
        config: {
          kind: "flow.human_approval",
          reviewerType: "user",
          reviewerId: "",
          prompt: "Review this artifact",
          deadline: "2026-11-01T09:00:00.000Z",
        },
        inputs: {
          reviewerId: {
            kind: "literal",
            value: 123,
          },
          artifactReference: {
            kind: "literal",
            value: { id: "artifact_123" },
          },
        },
      }),
    );

    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          code: "incompatible_data_types",
          nodeId: "approval",
          field: "reviewerId",
        },
        {
          code: "incompatible_data_types",
          nodeId: "approval",
          field: "artifactReference",
        },
      ]),
    );
  });
});
