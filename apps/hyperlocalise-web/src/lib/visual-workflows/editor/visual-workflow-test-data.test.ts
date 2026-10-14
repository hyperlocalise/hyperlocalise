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
import { runVisualWorkflowInterpreter } from "../runtime/interpreter";
import { createMockWorkflowExecutor } from "../runtime/mock-executor";
import { toVisualWorkflowDefinition } from "../schema/serializers";
import type { VisualWorkflowRfEdge, VisualWorkflowRfNode } from "../schema/types";
import {
  buildTestRunData,
  exampleTestData,
  findMissingTestValues,
  getTestDataFields,
  takesTestData,
  testDataFromRun,
  withTestValue,
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

const httpOutput = { status: 200, ok: true, headers: {}, body: "ok" };

describe("takesTestData", () => {
  it("is true for triggers and steps that call out, and false for steps that compute", () => {
    expect(takesTestData("trigger.source_upload")).toBe(true);
    expect(takesTestData("action.http")).toBe(true);
    expect(takesTestData("ai.agent")).toBe(true);
    expect(takesTestData("logic.if")).toBe(false);
    expect(takesTestData("flow.wait")).toBe(false);
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

  it("lists every required output of a trigger and an action step that is not set", () => {
    const missing = findMissingTestValues({
      nodes: [trigger, http],
      edges: [],
      testData: { t: { projectId: "p1" }, http: { status: 200 } },
      live: false,
    });
    expect(missing).toEqual([
      { nodeId: "t", path: "sourceFileId", reason: "required" },
      { nodeId: "http", path: "ok", reason: "required" },
      { nodeId: "http", path: "headers", reason: "required" },
      { nodeId: "http", path: "body", reason: "required" },
    ]);
  });

  it("asks only for the trigger's sample event in a live test", () => {
    const missing = findMissingTestValues({
      nodes: [trigger, http],
      edges: [],
      testData: { t: { projectId: "p1", sourceFileId: "f1" } },
      live: true,
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
      testData: { http: httpOutput, slack: { ok: true } },
      live: false,
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
      testData: { t: { channel: "C1" }, slack: { ok: true } },
      live: false,
    });
    expect(missing.filter((entry) => entry.nodeId === "t")).toEqual([
      { nodeId: "t", path: "text", reason: "read" },
    ]);
  });

  it("asks nothing of steps that compute their own result", () => {
    const set = node("set", "logic.set");
    expect(findMissingTestValues({ nodes: [set], edges: [], testData: {}, live: false })).toEqual(
      [],
    );
  });
});

describe("buildTestRunData", () => {
  it("sends the sample event and an entry for every step whose mock result the editor decides", () => {
    const nodes = [
      node("t", "trigger.manual"),
      node("http", "action.http"),
      node("if", "logic.if"),
      node("wait", "flow.wait"),
    ];
    expect(
      buildTestRunData({
        nodes,
        testData: { t: { name: "Ada" }, http: httpOutput },
        live: false,
      }),
    ).toEqual({
      triggerInput: { name: "Ada" },
      mockOutputs: { t: {}, http: httpOutput, if: {} },
    });
  });

  it("sends no test outputs for a live test", () => {
    const nodes = [node("t", "trigger.manual"), node("http", "action.http")];
    expect(
      buildTestRunData({ nodes, testData: { t: { a: 1 }, http: httpOutput }, live: true }),
    ).toEqual({ triggerInput: { a: 1 }, mockOutputs: {} });
  });

  it("makes a mock run use only the values given, inventing none", async () => {
    const trigger = node("t", "trigger.source_upload");
    const http = node("http", "action.http", {
      config: { ...createDefaultConfig("action.http"), url: "https://example.com" } as never,
    });
    const nodes = [trigger, http];
    const edges: VisualWorkflowRfEdge[] = [{ id: "e", source: "t", target: "http" }];
    const definition = toVisualWorkflowDefinition({ name: "Test data", nodes, edges });
    const run = (testData: Record<string, Record<string, unknown>>) => {
      const { triggerInput, mockOutputs } = buildTestRunData({ nodes, testData, live: false });
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
});

describe("exampleTestData", () => {
  it("fills every field with a visible example and keeps values already set", () => {
    const http = node("http", "action.http");
    const data = exampleTestData(http, { status: 503 });
    expect(data.status).toBe(503);
    expect(
      findMissingTestValues({ nodes: [http], edges: [], testData: { http: data }, live: false }),
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
