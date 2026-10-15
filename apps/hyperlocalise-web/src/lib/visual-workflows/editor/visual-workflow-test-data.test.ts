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

import { VISUAL_NODE_CATALOG, createDefaultConfig } from "../catalog/node-catalog";
import { createVisualWorkflowExecutionContext } from "../runtime/context";
import { executeLogicVisualWorkflowNode } from "../runtime/execute-logic-node";
import { runVisualWorkflowInterpreter } from "../runtime/interpreter";
import { createMockWorkflowExecutor } from "../runtime/mock-executor";
import { toVisualWorkflowDefinition } from "../schema/serializers";
import type { VisualWorkflowRfEdge, VisualWorkflowRfNode } from "../schema/types";
import {
  EMPTY_VISUAL_WORKFLOW_TEST_SETUP,
  buildTestRunData,
  canRunForReal,
  exampleTestData,
  findMissingTestValues,
  findRealStepsFedByTestData,
  getTestDataFields,
  isMockable,
  pruneTestSetup,
  testDataFromRun,
  visualWorkflowTestSetupSchema,
  withTestValue,
  type VisualWorkflowTestSetup,
} from "./visual-workflow-test-data";

function node(
  id: string,
  type: VisualWorkflowRfNode["data"]["catalogType"],
  extra?: Partial<VisualWorkflowRfNode["data"]>,
): VisualWorkflowRfNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { catalogType: type, config: createDefaultConfig(type), runStatus: "idle", ...extra },
  };
}

function setup(partial: Partial<VisualWorkflowTestSetup> = {}): VisualWorkflowTestSetup {
  return { ...EMPTY_VISUAL_WORKFLOW_TEST_SETUP, ...partial };
}

const httpOutput = { status: 200, ok: true, headers: {}, body: "ok" };

describe("isMockable", () => {
  it("is true for triggers and steps that call out, and false for steps the run works out", () => {
    expect(isMockable("trigger.source_upload")).toBe(true);
    expect(isMockable("action.http")).toBe(true);
    expect(isMockable("ai.agent")).toBe(true);
    expect(isMockable("logic.if")).toBe(false);
    expect(isMockable("flow.wait")).toBe(false);
    expect(isMockable("logic.merge")).toBe(false);
  });

  it("lets every step but a trigger run for real", () => {
    expect(canRunForReal("action.notify_slack")).toBe(true);
    expect(canRunForReal("trigger.manual")).toBe(false);
    expect(canRunForReal("logic.set")).toBe(false);
  });

  // A step that is not mockable gets no test data, so the run must work it out itself: through its
  // own logic, or, for Wait and Merge, in the run engine. Otherwise a test would make values up.
  it("leaves only steps the run works out unmockable", () => {
    const context = createVisualWorkflowExecutionContext({ triggerInput: {} });
    for (const { type } of VISUAL_NODE_CATALOG) {
      if (isMockable(type) || type === "flow.wait" || type === "logic.merge") continue;
      const result = executeLogicVisualWorkflowNode({
        node: { id: "step", type, config: createDefaultConfig(type) } as never,
        context,
        inputsResolved: true,
      });
      expect(result.ok || result.error.code !== "not_logic_node", type).toBe(true);
    }
  });
});

describe("getTestDataFields", () => {
  it("leaves out the trigger fields the run sets itself", () => {
    expect(getTestDataFields(node("t", "trigger.source_upload")).map((f) => f.path)).toEqual([
      "projectId",
      "sourceFileId",
    ]);
  });

  it("includes an action step's declared output fields", () => {
    const http = node("http", "action.http", {
      outputFields: [{ path: "json.items", type: "array" }],
    });
    expect(getTestDataFields(http).map((f) => f.path)).toContain("json.items");
  });
});

describe("findMissingTestValues", () => {
  const trigger = node("t", "trigger.source_upload");
  const http = node("http", "action.http");

  it("lists every required output of a trigger and a mocked step that is not set", () => {
    const missing = findMissingTestValues({
      nodes: [trigger, http],
      edges: [],
      setup: setup({ data: { t: { projectId: "p1" }, http: { status: 200 } } }),
    });
    expect(missing).toEqual([
      { nodeId: "t", path: "sourceFileId", reason: "required" },
      { nodeId: "http", path: "ok", reason: "required" },
      { nodeId: "http", path: "headers", reason: "required" },
      { nodeId: "http", path: "body", reason: "required" },
    ]);
  });

  it("asks nothing of a step that runs for real, and still asks for the trigger's sample", () => {
    const missing = findMissingTestValues({
      nodes: [trigger, http],
      edges: [],
      setup: setup({ data: { t: { projectId: "p1" } }, realNodeIds: ["http"] }),
    });
    expect(missing).toEqual([{ nodeId: "t", path: "sourceFileId", reason: "required" }]);
  });

  it("asks nothing of a mocked step set to fail", () => {
    const missing = findMissingTestValues({
      nodes: [http],
      edges: [],
      setup: setup({ failures: { http: { message: "Down" } } }),
    });
    expect(missing).toEqual([]);
  });

  it("lists an optional output that a wire, a binding or a template reads", () => {
    const slack = node("slack", "action.notify_slack", {
      config: {
        kind: "action.notify_slack",
        channelId: "C1",
        message: "Status {{ nodes.http.json.status }}",
      },
      inputs: { channelId: { kind: "reference", nodeId: "http", path: ["json", "channel"] } },
    });
    const edges: VisualWorkflowRfEdge[] = [
      { id: "w", source: "http", target: "slack", sourceHandle: "json", data: { kind: "data" } },
    ];
    const missing = findMissingTestValues({
      nodes: [http, slack],
      edges,
      setup: setup({ data: { http: httpOutput, slack: { ok: true } } }),
    });
    // Values under a missing one are not listed again.
    expect(missing.filter((entry) => entry.nodeId === "http")).toEqual([
      { nodeId: "http", path: "json", reason: "read" },
    ]);
  });

  it("reads `trigger.` templates and `$trigger` references from the trigger's sample event", () => {
    const manual = node("t", "trigger.manual");
    const slack = node("slack", "action.notify_slack", {
      config: { kind: "action.notify_slack", channelId: "{{ trigger.channel }}", message: "Hi" },
      inputs: { message: { kind: "reference", nodeId: "$trigger", path: ["text"] } },
    });
    const missing = findMissingTestValues({
      nodes: [manual, slack],
      edges: [],
      setup: setup({ data: { t: { channel: "C1" }, slack: { ok: true } } }),
    });
    expect(missing.filter((entry) => entry.nodeId === "t")).toEqual([
      { nodeId: "t", path: "text", reason: "read" },
    ]);
  });

  it("asks nothing of steps that compute their own result", () => {
    const set = node("set", "logic.set");
    expect(findMissingTestValues({ nodes: [set], edges: [], setup: setup() })).toEqual([]);
  });
});

describe("findRealStepsFedByTestData", () => {
  const trigger = node("t", "trigger.manual");
  const http = node("http", "action.http");
  const set = node("set", "logic.set", {
    config: {
      kind: "logic.set",
      assignments: [{ key: "text", value: "{{ nodes.http.body }}" }],
    },
  });
  const slack = node("slack", "action.notify_slack", {
    config: { kind: "action.notify_slack", channelId: "C1", message: "{{ nodes.set.text }}" },
  });
  const email = node("email", "action.notify_email", {
    config: {
      ...createDefaultConfig("action.notify_email"),
      subject: "{{ trigger.name }}",
    } as never,
  });

  it("names a real step that reads a mocked step's data through a step the run works out", () => {
    expect(
      findRealStepsFedByTestData({
        nodes: [trigger, http, set, slack, email],
        edges: [],
        setup: setup({ realNodeIds: ["slack", "email"] }),
      }),
    ).toEqual([{ nodeId: "slack", mockedNodeIds: ["http"] }]);
  });

  it("names none when the step it reads runs for real too", () => {
    expect(
      findRealStepsFedByTestData({
        nodes: [trigger, http, set, slack],
        edges: [],
        setup: setup({ realNodeIds: ["slack", "http"] }),
      }),
    ).toEqual([]);
  });

  it("follows a data wire", () => {
    const wired = node("slack", "action.notify_slack");
    const edges: VisualWorkflowRfEdge[] = [
      { id: "w", source: "http", target: "slack", sourceHandle: "body", data: { kind: "data" } },
    ];
    expect(
      findRealStepsFedByTestData({
        nodes: [http, wired],
        edges,
        setup: setup({ realNodeIds: ["slack"] }),
      }),
    ).toEqual([{ nodeId: "slack", mockedNodeIds: ["http"] }]);
  });
});

describe("buildTestRunData", () => {
  it("sends the sample event and an entry for every step whose result the editor decides", () => {
    const nodes = [
      node("t", "trigger.manual"),
      node("http", "action.http"),
      node("if", "logic.if"),
      node("wait", "flow.wait"),
    ];
    expect(
      buildTestRunData({ nodes, setup: setup({ data: { t: { name: "Ada" }, http: httpOutput } }) }),
    ).toEqual({
      mode: "mock",
      triggerInput: { name: "Ada" },
      mockOutputs: { t: {}, http: httpOutput, if: {}, wait: {} },
      realNodeIds: [],
      mockFailures: {},
    });
  });

  it("lists the steps that run for real, without an entry, and the failures of mocked ones", () => {
    const nodes = [
      node("t", "trigger.manual"),
      node("http", "action.http"),
      node("slack", "action.notify_slack"),
    ];
    expect(
      buildTestRunData({
        nodes,
        setup: setup({
          data: { http: httpOutput },
          realNodeIds: ["slack", "t", "gone"],
          failures: { http: { code: "timeout" }, slack: { message: "ignored" } },
        }),
      }),
    ).toEqual({
      mode: "mock",
      triggerInput: {},
      mockOutputs: { t: {}, http: httpOutput },
      realNodeIds: ["slack"],
      mockFailures: { http: { code: "timeout" } },
    });
  });

  it("is a live run when every step that could be mocked runs for real", () => {
    const nodes = [node("t", "trigger.manual"), node("http", "action.http")];
    expect(
      buildTestRunData({
        nodes,
        setup: setup({ data: { t: { a: 1 }, http: httpOutput }, realNodeIds: ["http"] }),
      }),
    ).toEqual({
      mode: "live",
      triggerInput: { a: 1 },
      mockOutputs: {},
      realNodeIds: ["http"],
      mockFailures: {},
    });
  });

  it("makes a mock run use only the values given, inventing none", async () => {
    const trigger = node("t", "trigger.source_upload");
    const http = node("http", "action.http", {
      config: { ...createDefaultConfig("action.http"), url: "https://example.com" } as never,
    });
    const nodes = [trigger, http];
    const edges: VisualWorkflowRfEdge[] = [{ id: "e", source: "t", target: "http" }];
    const definition = toVisualWorkflowDefinition({ name: "Test data", nodes, edges });
    const run = (data: Record<string, Record<string, unknown>>) => {
      const { triggerInput, mockOutputs } = buildTestRunData({ nodes, setup: setup({ data }) });
      return runVisualWorkflowInterpreter({
        definition,
        organizationId: "00000000-0000-4000-8000-000000000099",
        triggerInput,
        mockMode: true,
        executeNode: createMockWorkflowExecutor(mockOutputs),
      });
    };

    const missing = await run({ t: { projectId: "p1" }, http: httpOutput });
    expect(missing).toMatchObject({
      ok: false,
      failedNodeId: "t",
      error: { code: "invalid_node_output" },
    });

    const complete = await run({ t: { projectId: "p1", sourceFileId: "f1" }, http: httpOutput });
    expect(complete.ok).toBe(true);
    expect(complete.context.nodes.t).toMatchObject({ projectId: "p1", sourceFileId: "f1" });
    expect(complete.context.nodes.http).toEqual(httpOutput);
  });

  it("settles Wait and Merge from their inputs in a mock run, making nothing up", async () => {
    const nodes = [
      node("t", "trigger.manual"),
      node("a", "logic.set", {
        config: { kind: "logic.set", assignments: [{ key: "result", value: "sent" }] },
      }),
      node("b", "logic.set", {
        config: { kind: "logic.set", assignments: [{ key: "result", value: "posted" }] },
      }),
      node("merge", "logic.merge", {
        config: {
          kind: "logic.merge",
          mode: "all",
          inputs: [
            { id: "a-input", name: "A" },
            { id: "b-input", name: "B" },
          ],
        } as never,
        inputs: {
          "value.a-input": { kind: "reference", nodeId: "a", path: ["result"], optional: true },
          "value.b-input": { kind: "reference", nodeId: "b", path: ["result"], optional: true },
        },
      }),
      node("wait", "flow.wait"),
    ];
    const edges: VisualWorkflowRfEdge[] = [
      { id: "1", source: "t", target: "a" },
      { id: "2", source: "t", target: "b" },
      { id: "3", source: "a", target: "merge", targetHandle: "a-input" },
      { id: "4", source: "b", target: "merge", targetHandle: "b-input" },
      { id: "5", source: "merge", target: "wait", sourceHandle: "completed" },
    ];
    const definition = toVisualWorkflowDefinition({ name: "Merge", nodes, edges });
    const { triggerInput, mockOutputs } = buildTestRunData({ nodes, setup: setup() });
    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId: "00000000-0000-4000-8000-000000000099",
      triggerInput,
      mockMode: true,
      executeNode: createMockWorkflowExecutor(mockOutputs),
    });
    expect(result.ok).toBe(true);
    expect(result.context.nodes.merge).toMatchObject({
      status: "completed",
      values: { "a-input": "sent", "b-input": "posted" },
    });
    expect(result.context.nodes.merge).not.toHaveProperty("simulated");
    expect(result.context.nodes.wait).toMatchObject({ status: "completed" });
    expect(result.context.nodes.wait).not.toHaveProperty("simulated");
  });

  it("fails a mocked step with its error, and the step's On error decides what follows", async () => {
    const trigger = node("t", "trigger.manual");
    const http = node("http", "action.http", {
      config: {
        ...createDefaultConfig("action.http"),
        url: "https://example.com",
        onError: "continue",
      } as never,
    });
    const set = node("set", "logic.set", {
      config: {
        kind: "logic.set",
        assignments: [{ key: "after", value: "ran" }],
      },
    });
    const nodes = [trigger, http, set];
    const edges: VisualWorkflowRfEdge[] = [
      { id: "1", source: "t", target: "http" },
      { id: "2", source: "http", target: "set" },
    ];
    const definition = toVisualWorkflowDefinition({ name: "Failure", nodes, edges });
    const { triggerInput, mockOutputs, mockFailures } = buildTestRunData({
      nodes,
      setup: setup({ failures: { http: { code: "http_error", message: "Server down" } } }),
    });
    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId: "00000000-0000-4000-8000-000000000099",
      triggerInput,
      mockMode: true,
      executeNode: createMockWorkflowExecutor(mockOutputs, mockFailures),
    });
    expect(result.ok).toBe(true);
    expect(result.context.nodes.http).toMatchObject({
      failed: true,
      error: { code: "http_error", message: "Server down" },
    });
    // On error is Continue, so the next step still runs.
    expect(result.context.nodes.set).toEqual({ after: "ran" });
  });
});

describe("pruneTestSetup", () => {
  it("drops entries for steps the workflow no longer has", () => {
    expect(
      pruneTestSetup(
        setup({
          data: { a: { x: 1 }, gone: { y: 2 } },
          realNodeIds: ["a", "gone"],
          failures: { gone: { code: "c" } },
        }),
        ["a"],
      ),
    ).toEqual({ data: { a: { x: 1 } }, realNodeIds: ["a"], failures: {} });
  });
});

describe("visualWorkflowTestSetupSchema", () => {
  it("fills what is left out and refuses an unknown key", () => {
    expect(visualWorkflowTestSetupSchema.parse({ data: { a: { x: 1 } } })).toEqual({
      data: { a: { x: 1 } },
      realNodeIds: [],
      failures: {},
    });
    expect(visualWorkflowTestSetupSchema.safeParse({ live: true }).success).toBe(false);
  });

  it("refuses a setup too large to save", () => {
    const big = { data: { a: { text: "x".repeat(600_000) } } };
    expect(visualWorkflowTestSetupSchema.safeParse(big).success).toBe(false);
  });
});

describe("exampleTestData", () => {
  it("fills every field with a visible example and keeps values already set", () => {
    const http = node("http", "action.http");
    const data = exampleTestData(http, { status: 503 });
    expect(data.status).toBe(503);
    expect(
      findMissingTestValues({ nodes: [http], edges: [], setup: setup({ data: { http: data } }) }),
    ).toEqual([]);
  });

  it("gives a trigger's string fields a value that says it is an example", () => {
    expect(exampleTestData(node("t", "trigger.source_upload"))).toEqual({
      projectId: "example projectId",
      sourceFileId: "example sourceFileId",
    });
  });
});

describe("testDataFromRun", () => {
  it("takes each step's last successful output, without the values a run sets itself", () => {
    const nodes = [
      node("t", "trigger.manual"),
      node("http", "action.http"),
      node("if", "logic.if"),
    ];
    expect(
      testDataFromRun(nodes, [
        { nodeId: "t", status: "succeeded", outputSnapshot: { triggeredAt: "now", name: "Ada" } },
        { nodeId: "http", status: "succeeded", outputSnapshot: { ...httpOutput, status: 500 } },
        { nodeId: "http", status: "succeeded", outputSnapshot: { ...httpOutput, simulated: true } },
        { nodeId: "if", status: "succeeded", outputSnapshot: { result: true } },
      ]),
    ).toEqual({ t: { name: "Ada" }, http: httpOutput });
  });
});

describe("withTestValue", () => {
  it("sets a nested value and removes one without touching the rest", () => {
    const data = { status: 200, json: { items: [] } };
    expect(withTestValue(data, "json.count", 2)).toEqual({
      status: 200,
      json: { items: [], count: 2 },
    });
    expect(withTestValue(data, "json.items", undefined)).toEqual({ status: 200, json: {} });
    expect(data).toEqual({ status: 200, json: { items: [] } });
  });
});
