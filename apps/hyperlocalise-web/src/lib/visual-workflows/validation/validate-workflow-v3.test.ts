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
import type { VisualCatalogType, VisualWorkflowV3Definition } from "../schema/types";
import { validateVisualWorkflowV3Definition } from "./validate-workflow-v3";

type Edge = VisualWorkflowV3Definition["edges"][number];

function step(id: string, type: VisualCatalogType): VisualWorkflowV3Definition["nodes"][number] {
  return { id, type, config: createDefaultConfig(type) };
}

const runs = (source: string, target: string, sourcePortId = "success"): Edge => ({
  id: `${source}-${sourcePortId}-${target}`,
  kind: "execution",
  source,
  target,
  sourcePortId,
  targetPortId: "input",
});

const wire = (
  source: string,
  sourcePortId: string,
  target: string,
  targetPortId: string,
): Edge => ({
  id: `${source}.${sourcePortId}-${target}.${targetPortId}`,
  kind: "data",
  source,
  target,
  sourcePortId,
  targetPortId,
});

/** A Slack step with its channel chosen, so the settings checks pass and the wires are checked. */
function slack(): VisualWorkflowV3Definition["nodes"][number] {
  return {
    id: "slack",
    type: "action.notify_slack",
    config: { kind: "action.notify_slack", channelId: "C123", message: "" },
  };
}

function http(): VisualWorkflowV3Definition["nodes"][number] {
  const node = step("http", "action.http");
  node.config = { ...node.config, url: "https://example.com" } as typeof node.config;
  return node;
}

function bindingIssues(
  nodes: VisualWorkflowV3Definition["nodes"],
  edges: Edge[],
): ReturnType<typeof validateVisualWorkflowV3Definition> {
  return validateVisualWorkflowV3Definition({
    schemaVersion: 3,
    name: "Wires",
    nodes,
    edges,
    editor: { positions: {} },
  }).filter((issue) => issue.code === "invalid_binding");
}

describe("validateVisualWorkflowV3Definition data wires", () => {
  it.each([
    ["an HTTP request's json", "action.http", "json"],
    ["an AI agent's json", "ai.agent", "json"],
  ] as const)("accepts a wire from %s, an output that may be missing", (_name, type, output) => {
    expect(
      bindingIssues(
        [step("trigger", "trigger.manual"), step("source", type), slack()],
        [
          runs("trigger", "source"),
          runs("source", "slack"),
          wire("source", output, "slack", "message"),
        ],
      ),
    ).toEqual([]);
  });

  it("still refuses a wire from a step that does not always run before this one", () => {
    const branch = step("branch", "logic.if");
    branch.config = { kind: "logic.if", condition: "1 == 1" };

    expect(
      bindingIssues(
        [step("trigger", "trigger.manual"), branch, http(), step("other", "logic.set"), slack()],
        [
          runs("trigger", "branch"),
          runs("branch", "http", "true"),
          runs("branch", "other", "false"),
          runs("http", "slack"),
          runs("other", "slack"),
          wire("http", "body", "slack", "message"),
        ],
      ),
    ).toEqual([expect.objectContaining({ code: "invalid_binding", nodeId: "slack" })]);
  });
});
