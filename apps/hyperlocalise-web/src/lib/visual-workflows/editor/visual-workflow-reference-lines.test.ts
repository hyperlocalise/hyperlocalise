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
import type { VisualWorkflowRfEdge, VisualWorkflowRfNode } from "../schema/types";
import { listVisualWorkflowReferenceLines } from "./visual-workflow-reference-lines";

function node(id: string, type: VisualWorkflowRfNode["type"]): VisualWorkflowRfNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { catalogType: type, config: createDefaultConfig(type), runStatus: "idle" },
  };
}

function slackWithMessage(message: string, extras?: Partial<VisualWorkflowRfNode["data"]>) {
  const slack = node("slack", "action.notify_slack");
  return {
    ...slack,
    data: {
      ...slack.data,
      ...extras,
      config: {
        kind: "action.notify_slack" as const,
        channelId: "",
        message,
        onError: "stop" as const,
      },
    },
  };
}

describe("listVisualWorkflowReferenceLines", () => {
  const trigger = node("trigger", "trigger.manual");
  const http = node("http", "action.http");

  it("draws a line from the longest matching output port of an earlier step", () => {
    const slack = slackWithMessage("Review {{ nodes.http.json.count }} items");
    const lines = listVisualWorkflowReferenceLines([trigger, http, slack], []);

    expect(lines).toEqual([
      {
        id: "reference:http:json->slack:message",
        source: "http",
        sourceHandle: "json",
        target: "slack",
        targetHandle: "message",
      },
    ]);
  });

  it("draws a line from the trigger when the template reads a trigger field", () => {
    const slack = slackWithMessage("Started {{ trigger.triggeredAt }}");
    const lines = listVisualWorkflowReferenceLines([trigger, slack], []);

    expect(lines).toEqual([
      expect.objectContaining({
        source: "trigger",
        sourceHandle: "triggeredAt",
        target: "slack",
        targetHandle: "message",
      }),
    ]);
  });

  it("skips a setting that already has a data wire or a stored binding", () => {
    const wired = slackWithMessage("Review {{ nodes.http.json.count }}");
    const bound = slackWithMessage("Review {{ nodes.http.json.count }}", {
      inputs: { message: { kind: "reference", nodeId: "http", path: ["json"] } },
    });
    bound.id = "bound";
    const wire: VisualWorkflowRfEdge = {
      id: "http-slack",
      source: "http",
      target: "slack",
      sourceHandle: "json",
      targetHandle: "message",
      data: { kind: "data" },
    };

    expect(listVisualWorkflowReferenceLines([trigger, http, wired], [wire])).toEqual([]);
    expect(listVisualWorkflowReferenceLines([trigger, http, bound], [])).toEqual([]);
  });

  it("skips missing steps, unknown ports, self-references, and unknown expressions", () => {
    const slack = slackWithMessage(
      "{{ nodes.gone.json }} {{ nodes.http.unknown }} {{ nodes.slack.sent }} {{ something.else }}",
    );

    expect(listVisualWorkflowReferenceLines([trigger, http, slack], [])).toEqual([]);
  });

  it("keeps one line when the same source port is read twice in one setting", () => {
    const slack = slackWithMessage("{{ nodes.http.json.a }} and {{ nodes.http.json.b }}");
    const lines = listVisualWorkflowReferenceLines([trigger, http, slack], []);

    expect(lines).toHaveLength(1);
    expect(lines[0]?.sourceHandle).toBe("json");
  });
});
