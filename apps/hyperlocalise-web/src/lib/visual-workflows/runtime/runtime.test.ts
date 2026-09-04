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
import { createVisualWorkflowExecutionContext } from "./context";
import { evaluateVisualWorkflowCondition, resolveVisualWorkflowTemplate } from "./expressions";
import { runVisualWorkflowInterpreter } from "./interpreter";
import type { VisualWorkflowDefinition } from "../schema/types";

describe("visual workflow expressions", () => {
  it("resolves trigger and node template paths", () => {
    const context = createVisualWorkflowExecutionContext({
      triggerInput: { name: "Lead" },
    });
    context.nodes.trigger = { name: "Lead" };
    context.nodes.http = { status: 200 };

    expect(resolveVisualWorkflowTemplate("Hello {{trigger.name}}", context)).toBe("Hello Lead");
    expect(resolveVisualWorkflowTemplate("Status {{nodes.http.status}}", context)).toBe(
      "Status 200",
    );
  });

  it("evaluates simple truthy and comparison conditions", () => {
    const context = createVisualWorkflowExecutionContext({
      triggerInput: { score: 10 },
    });
    context.nodes.check = { value: "5" };

    expect(evaluateVisualWorkflowCondition("true", context)).toBe(true);
    expect(evaluateVisualWorkflowCondition("{{nodes.check.value}} == 5", context)).toBe(true);
    expect(evaluateVisualWorkflowCondition("{{trigger.score}} > 5", context)).toBe(true);
  });

  it("treats blank and falsey literals as false and unknown paths as empty", () => {
    const context = createVisualWorkflowExecutionContext({
      triggerInput: { label: "alpha" },
    });

    expect(resolveVisualWorkflowTemplate("{{trigger.missing}}", context)).toBe("");
    expect(evaluateVisualWorkflowCondition("{{trigger.missing}}", context)).toBe(false);
    expect(evaluateVisualWorkflowCondition("false", context)).toBe(false);
    expect(evaluateVisualWorkflowCondition("0", context)).toBe(false);
    expect(evaluateVisualWorkflowCondition("{{trigger.label}} != beta", context)).toBe(true);
    expect(evaluateVisualWorkflowCondition("{{trigger.label}} >= beta", context)).toBe(false);
  });
});

describe("visual workflow node execution edges", () => {
  it("resolves empty for_each collections to an empty item list", async () => {
    const { executeVisualWorkflowNode } = await import("./execute-node");
    const context = createVisualWorkflowExecutionContext({ triggerInput: {} });
    const result = await executeVisualWorkflowNode({
      organizationId: "00000000-0000-4000-8000-000000000001",
      context,
      node: {
        id: "loop",
        type: "logic.for_each",
        config: createDefaultConfig("logic.for_each"),
      },
    });

    expect(result).toEqual({
      ok: true,
      output: {
        count: 0,
        items: [],
      },
    });
  });

  it("rejects blank HTTP URLs before fetching", async () => {
    const { executeVisualWorkflowNode } = await import("./execute-node");
    const context = createVisualWorkflowExecutionContext({ triggerInput: {} });
    const result = await executeVisualWorkflowNode({
      organizationId: "00000000-0000-4000-8000-000000000001",
      context,
      node: {
        id: "http",
        type: "action.http",
        config: {
          kind: "action.http",
          method: "GET",
          url: "   ",
          onError: "stop",
        },
      },
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "missing_url", message: "HTTP URL is required." },
    });
  });

  it("assigns fields in logic.set nodes", async () => {
    const { executeVisualWorkflowNode } = await import("./execute-node");
    const context = createVisualWorkflowExecutionContext({
      triggerInput: { name: "Ada" },
    });
    const result = await executeVisualWorkflowNode({
      organizationId: "00000000-0000-4000-8000-000000000001",
      context,
      node: {
        id: "set",
        type: "logic.set",
        config: {
          kind: "logic.set",
          assignments: [
            { key: "greeting", value: "Hello {{trigger.name}}" },
            { key: "count", value: "3" },
          ],
        },
      },
    });

    expect(result).toEqual({
      ok: true,
      output: {
        greeting: "Hello Ada",
        count: 3,
      },
    });
  });

  it("routes switch nodes to the matching case", async () => {
    const { executeVisualWorkflowNode } = await import("./execute-node");
    const context = createVisualWorkflowExecutionContext({ triggerInput: {} });
    context.nodes.http = { json: { status: "ready" } };
    const result = await executeVisualWorkflowNode({
      organizationId: "00000000-0000-4000-8000-000000000001",
      context,
      node: {
        id: "switch",
        type: "logic.switch",
        config: {
          kind: "logic.switch",
          expression: "{{nodes.http.json.status}}",
          cases: [{ value: "pending" }, { value: "ready" }],
        },
      },
    });

    expect(result).toEqual({
      ok: true,
      output: {
        expression: "ready",
        matchedCase: "1",
      },
      switchCase: "1",
    });
  });
});

describe("visual workflow interpreter", () => {
  it("walks trigger and if nodes without following the false branch", async () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 1,
      name: "Branching",
      nodes: [
        { id: "t", type: "trigger.manual", config: createDefaultConfig("trigger.manual") },
        { id: "iff", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
        { id: "ok", type: "ai.agent", config: { kind: "ai.agent", prompt: "noop" } },
        { id: "no", type: "ai.agent", config: { kind: "ai.agent", prompt: "noop" } },
      ],
      edges: [
        { id: "e1", source: "t", target: "iff", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "iff", target: "ok", sourceHandle: "true", targetHandle: null },
        { id: "e3", source: "iff", target: "no", sourceHandle: "false", targetHandle: null },
      ],
      editor: { positions: {} },
    };

    const updates: string[] = [];
    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId: "00000000-0000-4000-8000-000000000001",
      onNodeUpdate: async (update) => {
        if (update.status === "succeeded") {
          updates.push(update.nodeId);
        }
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected failed interpreter result");
    }
    expect(updates).toEqual(["t", "iff"]);
    expect(result.failedNodeId).toBe("ok");
  });

  it("waits for all incoming branches before executing join nodes", async () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 1,
      name: "Join",
      nodes: [
        { id: "t", type: "trigger.manual", config: createDefaultConfig("trigger.manual") },
        { id: "a", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
        { id: "b", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
        { id: "c", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
        {
          id: "join",
          type: "logic.if",
          config: { kind: "logic.if", condition: "{{nodes.c.result}} == true" },
        },
      ],
      edges: [
        { id: "e1", source: "t", target: "a", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "t", target: "b", sourceHandle: null, targetHandle: null },
        { id: "e3", source: "a", target: "join", sourceHandle: "true", targetHandle: null },
        { id: "e4", source: "b", target: "c", sourceHandle: "true", targetHandle: null },
        { id: "e5", source: "c", target: "join", sourceHandle: "true", targetHandle: null },
      ],
      editor: { positions: {} },
    };

    const started: string[] = [];
    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId: "00000000-0000-4000-8000-000000000001",
      onNodeUpdate: async (update) => {
        if (update.status === "running") {
          started.push(update.nodeId);
        }
      },
    });

    expect(result.ok).toBe(true);
    expect(started.indexOf("join")).toBeGreaterThan(started.indexOf("c"));
    expect(started.indexOf("join")).toBeGreaterThan(started.indexOf("a"));
  });

  it("still reaches join nodes when untaken if branches reconverge", async () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 1,
      name: "Conditional join",
      nodes: [
        { id: "t", type: "trigger.manual", config: createDefaultConfig("trigger.manual") },
        { id: "iff", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
        { id: "taken", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
        { id: "skipped", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
        {
          id: "join",
          type: "logic.if",
          config: { kind: "logic.if", condition: "{{nodes.taken.result}} == true" },
        },
      ],
      edges: [
        { id: "e1", source: "t", target: "iff", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "iff", target: "taken", sourceHandle: "true", targetHandle: null },
        { id: "e3", source: "iff", target: "skipped", sourceHandle: "false", targetHandle: null },
        { id: "e4", source: "taken", target: "join", sourceHandle: "true", targetHandle: null },
        { id: "e5", source: "skipped", target: "join", sourceHandle: "true", targetHandle: null },
      ],
      editor: { positions: {} },
    };

    const started: string[] = [];
    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId: "00000000-0000-4000-8000-000000000001",
      onNodeUpdate: async (update) => {
        if (update.status === "running") {
          started.push(update.nodeId);
        }
      },
    });

    expect(result.ok).toBe(true);
    expect(started).toContain("join");
    expect(started).not.toContain("skipped");
    expect(started.indexOf("join")).toBeGreaterThan(started.indexOf("taken"));
  });

  it("runs loop body once per collection item", async () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 1,
      name: "Loop",
      nodes: [
        { id: "t", type: "trigger.manual", config: createDefaultConfig("trigger.manual") },
        {
          id: "loop",
          type: "logic.for_each",
          config: { kind: "logic.for_each", collection: "{{trigger.items}}" },
        },
        { id: "noop", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
      ],
      edges: [
        { id: "e1", source: "t", target: "loop", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "loop", target: "noop", sourceHandle: null, targetHandle: null },
      ],
      editor: { positions: {} },
    };

    const started: string[] = [];
    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId: "00000000-0000-4000-8000-000000000001",
      triggerInput: { items: ["a", "b"] },
      onNodeUpdate: async (update) => {
        if (update.status === "running") {
          started.push(update.nodeId);
        }
      },
    });

    expect(result.ok).toBe(true);
    expect(started.filter((nodeId) => nodeId === "noop")).toHaveLength(2);
  });

  it("orders multi-node loop bodies by dependencies", async () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 1,
      name: "Ordered loop body",
      nodes: [
        { id: "t", type: "trigger.manual", config: createDefaultConfig("trigger.manual") },
        {
          id: "loop",
          type: "logic.for_each",
          config: { kind: "logic.for_each", collection: "{{trigger.items}}" },
        },
        { id: "first", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
        { id: "second", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
      ],
      edges: [
        { id: "e1", source: "t", target: "loop", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "loop", target: "first", sourceHandle: null, targetHandle: null },
        { id: "e3", source: "first", target: "second", sourceHandle: "true", targetHandle: null },
      ],
      editor: { positions: {} },
    };

    const started: string[] = [];
    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId: "00000000-0000-4000-8000-000000000001",
      triggerInput: { items: ["a"] },
      onNodeUpdate: async (update) => {
        if (update.status === "running") {
          started.push(update.nodeId);
        }
      },
    });

    expect(result.ok).toBe(true);
    expect(started.indexOf("second")).toBeGreaterThan(started.indexOf("first"));
  });

  it("respects conditional branching inside loop bodies", async () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 1,
      name: "Loop branching",
      nodes: [
        { id: "t", type: "trigger.manual", config: createDefaultConfig("trigger.manual") },
        {
          id: "loop",
          type: "logic.for_each",
          config: { kind: "logic.for_each", collection: "{{trigger.items}}" },
        },
        { id: "iff", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
        { id: "taken", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
        { id: "skipped", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
      ],
      edges: [
        { id: "e1", source: "t", target: "loop", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "loop", target: "iff", sourceHandle: null, targetHandle: null },
        { id: "e3", source: "iff", target: "taken", sourceHandle: "true", targetHandle: null },
        { id: "e4", source: "iff", target: "skipped", sourceHandle: "false", targetHandle: null },
      ],
      editor: { positions: {} },
    };

    const started: string[] = [];
    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId: "00000000-0000-4000-8000-000000000001",
      triggerInput: { items: ["a"] },
      onNodeUpdate: async (update) => {
        if (update.status === "running") {
          started.push(update.nodeId);
        }
      },
    });

    expect(result.ok).toBe(true);
    expect(started).toContain("taken");
    expect(started).not.toContain("skipped");
  });

  it("clears loop body outputs between iterations", async () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 1,
      name: "Loop stale outputs",
      nodes: [
        { id: "t", type: "trigger.manual", config: createDefaultConfig("trigger.manual") },
        {
          id: "loop",
          type: "logic.for_each",
          config: { kind: "logic.for_each", collection: "{{trigger.items}}" },
        },
        {
          id: "iff",
          type: "logic.if",
          config: { kind: "logic.if", condition: "{{nodes.loop.item}} == a" },
        },
        { id: "taken", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
        {
          id: "join",
          type: "logic.if",
          config: { kind: "logic.if", condition: "{{nodes.taken.result}} == true" },
        },
      ],
      edges: [
        { id: "e1", source: "t", target: "loop", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "loop", target: "iff", sourceHandle: null, targetHandle: null },
        { id: "e3", source: "iff", target: "taken", sourceHandle: "true", targetHandle: null },
        { id: "e4", source: "taken", target: "join", sourceHandle: "true", targetHandle: null },
      ],
      editor: { positions: {} },
    };

    const started: string[] = [];
    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId: "00000000-0000-4000-8000-000000000001",
      triggerInput: { items: ["a", "b"] },
      onNodeUpdate: async (update) => {
        if (update.status === "running") {
          started.push(update.nodeId);
        }
      },
    });

    expect(result.ok).toBe(true);
    expect(started.filter((nodeId) => nodeId === "join")).toHaveLength(1);
  });

  it("continues after a failed node when onError is continue", async () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 1,
      name: "Continue on error",
      nodes: [
        { id: "t", type: "trigger.manual", config: createDefaultConfig("trigger.manual") },
        {
          id: "http",
          type: "action.http",
          config: {
            kind: "action.http",
            method: "GET",
            url: "",
            onError: "continue",
          },
        },
        { id: "after", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
      ],
      edges: [
        { id: "e1", source: "t", target: "http", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "http", target: "after", sourceHandle: null, targetHandle: null },
      ],
      editor: { positions: {} },
    };

    const started: string[] = [];
    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId: "00000000-0000-4000-8000-000000000001",
      onNodeUpdate: async (update) => {
        if (update.status === "running") {
          started.push(update.nodeId);
        }
      },
    });

    expect(result.ok).toBe(true);
    expect(started).toContain("after");
  });

  it("follows error branches when onError is branch", async () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 1,
      name: "Error branch",
      nodes: [
        { id: "t", type: "trigger.manual", config: createDefaultConfig("trigger.manual") },
        {
          id: "http",
          type: "action.http",
          config: {
            kind: "action.http",
            method: "GET",
            url: "",
            onError: "branch",
          },
        },
        { id: "success", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
        { id: "error", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
      ],
      edges: [
        { id: "e1", source: "t", target: "http", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "http", target: "success", sourceHandle: null, targetHandle: null },
        { id: "e3", source: "http", target: "error", sourceHandle: "error", targetHandle: null },
      ],
      editor: { positions: {} },
    };

    const started: string[] = [];
    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId: "00000000-0000-4000-8000-000000000001",
      onNodeUpdate: async (update) => {
        if (update.status === "running") {
          started.push(update.nodeId);
        }
      },
    });

    expect(result.ok).toBe(true);
    expect(started).toContain("error");
    expect(started).not.toContain("success");
  });

  it("runs nested for-each loops for every outer and inner item", async () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 1,
      name: "Nested loop",
      nodes: [
        { id: "t", type: "trigger.manual", config: createDefaultConfig("trigger.manual") },
        {
          id: "outer",
          type: "logic.for_each",
          config: { kind: "logic.for_each", collection: "{{trigger.outer}}" },
        },
        {
          id: "inner",
          type: "logic.for_each",
          config: { kind: "logic.for_each", collection: "{{nodes.outer.item}}" },
        },
        { id: "noop", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
      ],
      edges: [
        { id: "e1", source: "t", target: "outer", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "outer", target: "inner", sourceHandle: null, targetHandle: null },
        { id: "e3", source: "inner", target: "noop", sourceHandle: null, targetHandle: null },
      ],
      editor: { positions: {} },
    };

    const started: string[] = [];
    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId: "00000000-0000-4000-8000-000000000001",
      triggerInput: { outer: [["a", "b"], ["c"]] },
      onNodeUpdate: async (update) => {
        if (update.status === "running") {
          started.push(update.nodeId);
        }
      },
    });

    expect(result.ok).toBe(true);
    expect(started.filter((nodeId) => nodeId === "noop")).toHaveLength(3);
  });
});
