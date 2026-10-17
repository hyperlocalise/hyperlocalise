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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createDefaultConfig } from "@/lib/visual-workflows/catalog/node-catalog";
import { toVisualWorkflowV3Definition } from "@/lib/visual-workflows/schema/serializers";
import type {
  VisualCatalogType,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "@/lib/visual-workflows/schema/types";
import { validateVisualWorkflowV3Definition } from "@/lib/visual-workflows/validation/validate-workflow-v3";

import { describeVisualWorkflowIssues } from "./visual-workflow-issues";

vi.mock("@/lib/visual-workflows/validation/validate-workflow-v3", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/visual-workflows/validation/validate-workflow-v3")>();
  return {
    ...actual,
    validateVisualWorkflowV3Definition: vi.fn(actual.validateVisualWorkflowV3Definition),
  };
});

function node(
  id: string,
  type: VisualCatalogType,
  config: Record<string, unknown> = {},
): VisualWorkflowRfNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      catalogType: type,
      config: { ...createDefaultConfig(type), ...config } as VisualWorkflowRfNode["data"]["config"],
      runStatus: "idle",
    },
  };
}

function next(source: string, target: string, sourceHandle = "success"): VisualWorkflowRfEdge {
  return {
    id: `${source}-${target}-${sourceHandle}`,
    source,
    target,
    sourceHandle,
    targetHandle: "input",
    data: { kind: "execution" },
  };
}

function issuesOf(nodes: VisualWorkflowRfNode[], edges: VisualWorkflowRfEdge[]): string[] {
  return describeVisualWorkflowIssues(toVisualWorkflowV3Definition({ name: "Test", nodes, edges }));
}

const slack = node("notify_slack", "action.notify_slack", { channelId: "C1", message: "Done" });

describe("describeVisualWorkflowIssues", () => {
  afterEach(() => {
    vi.mocked(validateVisualWorkflowV3Definition).mockClear();
  });

  it("says once that a Loop has nothing on Each item, and which setting reads a missing value", () => {
    // The Loop runs after either branch, so the HTTP request on one of them may not have run.
    const issues = issuesOf(
      [
        node("manual", "trigger.manual"),
        node("branch", "logic.if", { condition: "1 == 1" }),
        node("http", "action.http", { url: "https://api.example.com" }),
        node("other", "logic.set"),
        node("for_each", "logic.for_each", { collection: "[]" }),
      ],
      [
        next("manual", "branch"),
        next("branch", "http", "true"),
        next("branch", "other", "false"),
        next("http", "for_each"),
        next("other", "for_each"),
        {
          id: "wire",
          source: "http",
          target: "for_each",
          sourceHandle: "json",
          targetHandle: "collection",
          data: { kind: "data" },
        },
      ],
    );

    expect(issues).toEqual([
      "Loop [for_each] has no step connected to its Each item output. A Loop needs at least one there.",
      expect.stringMatching(/^collection on Loop \[for_each\] reads a value that may not be there/),
    ]);
  });

  it("names a setting that is empty, and a connection into a Loop's steps from outside", () => {
    expect(
      issuesOf(
        [node("manual", "trigger.manual"), node("notify_slack", "action.notify_slack")],
        [next("manual", "notify_slack")],
      ),
    ).toContain("channelId on Notify Slack [notify_slack] is empty and must be set.");
    expect(
      issuesOf(
        [
          node("manual", "trigger.manual"),
          node("for_each", "logic.for_each", { collection: "[1]" }),
          slack,
        ],
        [
          next("manual", "for_each"),
          next("for_each", "notify_slack", "each"),
          next("manual", "notify_slack"),
        ],
      ),
    ).toEqual([
      expect.stringMatching(
        /^The connection from Manual trigger \[manual\] to Notify Slack \[notify_slack\] crosses the edge of a Loop's Each item steps\./,
      ),
    ]);
  });

  it("says what is wrong with the flow itself", () => {
    expect(
      issuesOf(
        [node("manual", "trigger.manual"), node("stop", "flow.stop"), slack],
        [next("manual", "stop"), next("stop", "notify_slack")],
      ),
    ).toEqual([
      "Stop workflow [stop] ends the workflow, so nothing can follow it: the connection from Stop workflow [stop] to Notify Slack [notify_slack] must go.",
      "Notify Slack [notify_slack] cannot be reached from the trigger: no connection leads to it from the trigger, directly or through other steps.",
    ]);
    expect(issuesOf([slack], [])[0]).toBe(
      "The workflow has no trigger. It needs exactly one, which starts it.",
    );
  });

  it("names an issue it has no wording for and asks not to guess its cause", () => {
    vi.mocked(validateVisualWorkflowV3Definition).mockReturnValueOnce([
      { code: "brand_new_check", nodeId: "notify_slack" } as never,
    ]);

    expect(
      issuesOf([node("manual", "trigger.manual"), slack], [next("manual", "notify_slack")]),
    ).toEqual([
      "An issue of type brand_new_check on Notify Slack [notify_slack]. The page lists it; say only that, without guessing its cause.",
    ]);
  });
});
