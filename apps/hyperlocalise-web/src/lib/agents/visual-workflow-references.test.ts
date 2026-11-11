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

import { createDefaultConfig } from "@/lib/visual-workflows/catalog/node-catalog";
import type {
  VisualCatalogType,
  VisualNodeConfig,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "@/lib/visual-workflows/schema/types";

import { findVisualWorkflowReferenceProblems } from "./visual-workflow-references";

function node(
  id: string,
  type: VisualCatalogType,
  config: Partial<VisualNodeConfig> = {},
): VisualWorkflowRfNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      catalogType: type,
      config: { ...createDefaultConfig(type), ...config } as VisualNodeConfig,
      runStatus: "idle",
    },
  };
}

function edge(
  source: string,
  target: string,
  kind: "execution" | "data" = "execution",
): VisualWorkflowRfEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle: kind === "data" ? "text" : "success",
    targetHandle: kind === "data" ? "message" : "input",
    data: { kind },
  };
}

describe("findVisualWorkflowReferenceProblems", () => {
  it("passes references to the trigger and to steps that run before", () => {
    const nodes = [
      node("trigger", "trigger.manual"),
      node("ai", "ai.agent"),
      node("notify_slack", "action.notify_slack", {
        message: "{{ trigger.ref }}: {{ nodes.ai.text }}",
      }),
    ];
    const edges = [edge("trigger", "ai"), edge("ai", "notify_slack")];

    expect(findVisualWorkflowReferenceProblems({ nodes, edges })).toEqual([]);
  });

  it("names a step that is missing, one that runs later, and a trigger that is missing", () => {
    const nodes = [
      node("ai", "ai.agent", { prompt: "{{ nodes.notify_slack.sent }} {{ nodes.gone.text }}" }),
      node("notify_slack", "action.notify_slack", { message: "{{ trigger.ref }}" }),
    ];
    const edges = [edge("ai", "notify_slack")];

    expect(findVisualWorkflowReferenceProblems({ nodes, edges })).toEqual([
      { nodeId: "ai", reference: "{{ nodes.notify_slack.sent }}", reason: "not_earlier" },
      { nodeId: "ai", reference: "{{ nodes.gone.text }}", reason: "unknown_step" },
      { nodeId: "notify_slack", reference: "{{ trigger.ref }}", reason: "no_trigger" },
    ]);
  });

  it("reads nested settings such as HTTP headers and counts a data wire as running before", () => {
    const nodes = [
      node("trigger", "trigger.manual"),
      node("ai", "ai.agent"),
      node("http", "action.http", {
        headers: [{ key: "X-Text", value: "{{ nodes.ai.text }}" }],
      }),
      node("notify_slack", "action.notify_slack", { message: "{{ nodes.http.status }}" }),
    ];
    const edges = [edge("trigger", "http"), edge("ai", "http", "data")];

    expect(findVisualWorkflowReferenceProblems({ nodes, edges })).toEqual([
      { nodeId: "notify_slack", reference: "{{ nodes.http.status }}", reason: "not_earlier" },
    ]);
  });

  it("leaves expressions it does not know alone", () => {
    const nodes = [node("notify_slack", "action.notify_slack", { message: "{{ item.name }}" })];

    expect(findVisualWorkflowReferenceProblems({ nodes, edges: [] })).toEqual([]);
  });
});
