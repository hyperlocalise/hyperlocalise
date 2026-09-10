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
import { describe, it, expect, vi } from "vite-plus/test";
import { runVisualWorkflowInterpreter } from "./interpreter";
import { createMockWorkflowExecutor } from "./mock-executor";
import { resolveWorkflowBinding, resolveWorkflowNodeInputs } from "./bindings";
import { createVisualWorkflowExecutionContext } from "./context";
import { resolveHttpRequestBody, parseHttpResponseBody } from "./http-request";
import { redactWorkflowSnapshot, collectWorkflowSecrets } from "./snapshots";
import { validateVisualWorkflowDefinition } from "../validation/validate-workflow";
import type {
  CanonicalVisualWorkflowNode,
  CanonicalVisualWorkflowEdge,
  VisualWorkflowDefinition,
} from "../schema/types";
const trigger: CanonicalVisualWorkflowNode = {
  id: "trigger",
  type: "trigger.manual",
  config: { kind: "trigger.manual" },
};
const set = (id: string): CanonicalVisualWorkflowNode => ({
  id,
  type: "logic.set",
  config: { kind: "logic.set", assignments: [] },
});
const edge = (
  source: string,
  target: string,
  sourceHandle: string | null = null,
): CanonicalVisualWorkflowEdge => ({
  id: `${source}:${target}:${sourceHandle}`,
  source,
  target,
  sourceHandle,
  targetHandle: null,
});
const graph = (
  nodes: CanonicalVisualWorkflowNode[],
  edges: CanonicalVisualWorkflowEdge[],
): VisualWorkflowDefinition => ({
  schemaVersion: 2,
  name: "Regression",
  nodes: [trigger, ...nodes],
  edges,
  editor: { positions: {} },
});
const run = (definition: VisualWorkflowDefinition, triggerInput: Record<string, unknown> = {}) =>
  runVisualWorkflowInterpreter({
    definition,
    organizationId: "test",
    triggerInput,
    executeNode: createMockWorkflowExecutor(),
  });
describe("production workflow execution contracts", () => {
  it("rejects cycles rather than returning silent success", async () => {
    const result = await run(
      graph([set("a"), set("b")], [edge("trigger", "a"), edge("a", "b"), edge("b", "a")]),
    );
    expect(result.ok).toBe(false);
    expect(result.nodeResults).toEqual({});
  });
  it.each([true, false])("settles direct conditional joins for %s", async (outcome) => {
    const definition = graph(
      [
        {
          id: "branch",
          type: "logic.if",
          config: { kind: "logic.if", condition: String(outcome) },
        },
        set("join"),
      ],
      [edge("trigger", "branch"), edge("branch", "join", "true"), edge("branch", "join", "false")],
    );
    const result = await run(definition);
    expect(result.ok).toBe(true);
    expect(result.nodeResults).toHaveProperty("join");
  });
  it.each([true, false])("joins success and error paths with success=%s", async (success) => {
    const definition = graph(
      [
        {
          id: "http",
          type: "action.http",
          config: {
            kind: "action.http",
            method: "GET",
            url: "https://example.com",
            onError: "branch",
          },
        },
        set("success"),
        set("error"),
        set("join"),
      ],
      [
        edge("trigger", "http"),
        edge("http", "success"),
        edge("http", "error", "error"),
        edge("success", "join"),
        edge("error", "join"),
      ],
    );
    const mock = createMockWorkflowExecutor();
    const updates: string[] = [];
    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId: "test",
      executeNode: (args) =>
        args.node.id === "http" && !success
          ? Promise.resolve({
              ok: false,
              error: { code: "test_failure", message: "Expected failure" },
            })
          : mock(args),
      onNodeUpdate: (update) => {
        updates.push(`${update.nodeId}:${update.status}`);
      },
    });
    expect(result.ok).toBe(true);
    expect(result.nodeResults).toHaveProperty("join");
    expect(updates).toContain(success ? "error:skipped" : "http:handled_error");
  });
  it("runs Each item in isolation and Done once with collected outputs", async () => {
    const definition = graph(
      [
        {
          id: "loop",
          type: "logic.for_each",
          config: { kind: "logic.for_each", collection: "[]" },
          inputs: { collection: { kind: "reference", nodeId: "$trigger", path: ["items"] } },
          bodyNodeIds: ["copy"],
          collect: { value: { kind: "reference", nodeId: "copy", path: ["value"] } },
        },
        {
          ...set("copy"),
          inputs: { value: { kind: "reference", nodeId: "loop", path: ["item"] } },
        },
        set("done"),
      ],
      [edge("trigger", "loop"), edge("loop", "copy", "each"), edge("loop", "done", "done")],
    );
    const result = await run(definition, { items: [{ name: "a" }, { name: "b" }] });
    expect(result.ok).toBe(true);
    expect(result.nodeResults.loop).toEqual({
      count: 2,
      iterationOutputs: [{ value: { name: "a" } }, { value: { name: "b" } }],
    });
    expect(result.nodeResults).not.toHaveProperty("copy");
    expect(result.nodeResults).toHaveProperty("done");
    const empty = await run(definition, { items: [] });
    expect(empty.nodeResults.loop).toEqual({ count: 0, iterationOutputs: [] });
    expect(empty.nodeResults).toHaveProperty("done");
  });
  it("rejects duplicate identifiers and invalid handles", () => {
    expect(
      validateVisualWorkflowDefinition(
        graph([set("a"), set("a")], [edge("trigger", "a", "true")]),
      ).map((issue) => issue.code),
    ).toEqual(expect.arrayContaining(["duplicate_id", "invalid_handle"]));
  });
  it("does not swallow durable yields through continue-on-error", async () => {
    const definition = graph(
      [
        {
          id: "http",
          type: "action.http",
          config: {
            kind: "action.http",
            method: "GET",
            url: "https://example.com",
            onError: "continue",
          },
        },
        set("after"),
      ],
      [edge("trigger", "http"), edge("http", "after")],
    );
    const mock = createMockWorkflowExecutor();
    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId: "test",
      executeNode: (args) =>
        args.node.id === "http"
          ? Promise.resolve({ ok: false, error: { code: "yield_execution", message: "Yield" } })
          : mock(args),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("yield_execution");
    expect(result.nodeResults).not.toHaveProperty("after");
  });
  it("cancels before executing an external action", async () => {
    const execute = vi.fn(createMockWorkflowExecutor());
    const controller = new AbortController();
    controller.abort();
    const result = await runVisualWorkflowInterpreter({
      definition: graph([], []),
      organizationId: "test",
      executeNode: execute,
      signal: controller.signal,
    });
    expect(result.ok).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
});
describe("typed values and secret inspection", () => {
  it("preserves arrays, indexes, null, and explicit defaults", () => {
    const context = createVisualWorkflowExecutionContext({
      triggerInput: { items: [{ value: null }] },
    });
    expect(
      resolveWorkflowBinding(
        { kind: "reference", nodeId: "$trigger", path: ["items", 0, "value"] },
        context,
      ),
    ).toBeNull();
    expect(
      resolveWorkflowBinding(
        { kind: "reference", nodeId: "$trigger", path: ["missing"], fallback: [] },
        context,
      ),
    ).toEqual([]);
    expect(() =>
      resolveWorkflowBinding({ kind: "reference", nodeId: "$trigger", path: ["missing"] }, context),
    ).toThrow("missing_workflow_input");
    expect(resolveWorkflowBinding({ kind: "literal", value: false }, context)).toBe(false);
    expect(
      resolveWorkflowBinding(
        { kind: "reference", nodeId: "$trigger", path: ["missing"], optional: true },
        context,
      ),
    ).toBeUndefined();
  });
  it("serializes bound JSON once, including quotes and template-like content", () => {
    const body = { text: 'a "quote" and {{literal}}' };
    expect(
      resolveHttpRequestBody({
        body,
        bodyType: "json",
        method: "POST",
        resolved: true,
        context: createVisualWorkflowExecutionContext({}),
      }),
    ).toBe(JSON.stringify(body));
  });
  it("retains complete JSON responses above the preview length", () => {
    const body = { text: "x".repeat(10000) };
    expect(parseHttpResponseBody(JSON.stringify(body), true)).toEqual(body);
    expect(() => parseHttpResponseBody("invalid", true)).toThrow("invalid_http_json");
  });
  it("does not execute expression text stored in a literal binding", () => {
    const node: CanonicalVisualWorkflowNode = {
      id: "ai",
      type: "ai.agent",
      config: { kind: "ai.agent", prompt: "unused" },
      inputs: { prompt: { kind: "literal", value: "{{nodes.missing.text}}" } },
    };
    expect(
      resolveWorkflowNodeInputs(node, createVisualWorkflowExecutionContext({})).config,
    ).toMatchObject({ prompt: "{{nodes.missing.text}}" });
  });
  it("redacts secrets and copied values while retaining credential references", () => {
    const payload = {
      token: "private-value",
      credentialId: "credential-reference",
      body: "copied private-value",
    };
    const redacted = redactWorkflowSnapshot(payload, collectWorkflowSecrets(payload));
    expect(JSON.stringify(redacted)).not.toContain("private-value");
    expect(redacted).toMatchObject({ credentialId: "credential-reference" });
  });
  it("rejects references to deleted or future nodes", () => {
    const node = {
      ...set("a"),
      inputs: { value: { kind: "reference" as const, nodeId: "missing", path: ["value"] } },
    };
    expect(validateVisualWorkflowDefinition(graph([node], [edge("trigger", "a")]))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid_binding", nodeId: "a" })]),
    );
  });
});
