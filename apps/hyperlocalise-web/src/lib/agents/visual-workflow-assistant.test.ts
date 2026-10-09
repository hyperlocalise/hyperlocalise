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
import { toVisualWorkflowV3Definition } from "@/lib/visual-workflows/schema/serializers";
import type {
  VisualCatalogType,
  VisualWorkflowEditorState,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "@/lib/visual-workflows/schema/types";

import { buildVisualWorkflowEditorContext } from "./visual-workflow-editor-context";
import {
  applyVisualWorkflowEditChanges,
  applyVisualWorkflowEdits,
  collectVisualWorkflowEditChanges,
  describeVisualWorkflowCatalogue,
  describeVisualWorkflowPage,
  describeVisualWorkflowPageEdits,
  EDIT_VISUAL_WORKFLOW_TOOL_NAME,
  editVisualWorkflow,
  listVisualWorkflowPageEdits,
  summarizeVisualWorkflowEditCall,
  toVisualWorkflowChangeLines,
  visualWorkflowEditor,
} from "./visual-workflow-assistant";

function node(
  id: string,
  type: VisualCatalogType,
  extra: Partial<VisualWorkflowRfNode> = {},
): VisualWorkflowRfNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { catalogType: type, config: createDefaultConfig(type), runStatus: "idle" },
    ...extra,
  };
}

function edge(
  source: string,
  target: string,
  sourceHandle: string | null = "success",
): VisualWorkflowRfEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle,
    targetHandle: "input",
    data: { kind: "execution" },
  };
}

const base: VisualWorkflowEditorState = {
  name: "Nightly sync",
  nodes: [
    node("trigger", "trigger.manual"),
    node("set", "logic.set", { position: { x: 340, y: 0 } }),
  ],
  edges: [edge("trigger", "set")],
};

function context(state: VisualWorkflowEditorState = base) {
  return buildVisualWorkflowEditorContext({
    editorSessionId: "editor-1",
    visualWorkflowId: "workflow-1",
    definition: toVisualWorkflowV3Definition(state),
    projectName: "Website",
  });
}

describe("applyVisualWorkflowEdits", () => {
  it("adds a node after another, connected and placed like the canvas' + button", () => {
    const { state, results } = applyVisualWorkflowEdits({
      state: base,
      operations: [
        {
          op: "add_node",
          id: "slack",
          type: "action.notify_slack",
          after: { nodeId: "set", handle: null },
          config: { message: "Sync finished" },
        },
      ],
    });

    expect(results[0]).toMatchObject({ status: "applied", op: { position: { x: 680, y: 0 } } });
    const slack = state.nodes.find((entry) => entry.id === "slack");
    expect(slack?.data.config).toMatchObject({
      kind: "action.notify_slack",
      message: "Sync finished",
    });
    expect(state.edges.map((entry) => `${entry.source}>${entry.target}`)).toEqual([
      "trigger>set",
      "set>slack",
    ]);
  });

  it("refuses a second trigger, a taken id, an unknown node and settings the type does not have", () => {
    const { state, results } = applyVisualWorkflowEdits({
      state: base,
      operations: [
        { op: "add_node", id: "again", type: "trigger.scheduled" },
        { op: "add_node", id: "set", type: "logic.set" },
        { op: "remove_node", nodeId: "nope" },
        { op: "configure_node", nodeId: "set", config: { assignments: "not a list" } },
      ],
    });

    expect(
      results.map((result) => (result.status === "rejected" ? result.code : "applied")),
    ).toEqual(["trigger_exists", "node_id_taken", "unknown_node", "invalid_config"]);
    expect(state).toBe(base);
  });

  it("removes a node with its edges, connects, disconnects, configures and renames", () => {
    const { state, results } = applyVisualWorkflowEdits({
      state: {
        ...base,
        nodes: [...base.nodes, node("if", "logic.if", { position: { x: 680, y: 0 } })],
      },
      operations: [
        { op: "disconnect", source: "trigger", target: "set" },
        { op: "connect", source: "trigger", sourceHandle: null, target: "if", targetHandle: null },
        { op: "configure_node", nodeId: "if", config: { condition: "status == 'ok'" } },
        { op: "remove_node", nodeId: "set" },
        { op: "rename_workflow", name: " Nightly check " },
      ],
    });

    expect(results.every((result) => result.status === "applied")).toBe(true);
    expect(state.name).toBe("Nightly check");
    expect(state.nodes.map((entry) => entry.id)).toEqual(["trigger", "if"]);
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0]).toMatchObject({ source: "trigger", target: "if" });
    expect(state.nodes[1]?.data.config).toMatchObject({ condition: "status == 'ok'" });
  });

  it("rejects a connection the canvas would, with its reason", () => {
    const { results } = applyVisualWorkflowEdits({
      state: base,
      operations: [
        { op: "connect", source: "set", sourceHandle: null, target: "trigger", targetHandle: null },
      ],
    });

    expect(results[0]).toMatchObject({ status: "rejected" });
    expect(results[0].status === "rejected" && results[0].message.length > 0).toBe(true);
  });

  it("sets and clears a node's input bindings, and knows the inputs it has", () => {
    const withHttp: VisualWorkflowEditorState = {
      ...base,
      nodes: [...base.nodes, node("call", "action.http", { position: { x: 680, y: 0 } })],
    };
    const { state, results } = applyVisualWorkflowEdits({
      state: withHttp,
      operations: [
        {
          op: "configure_node",
          nodeId: "call",
          inputs: { url: { kind: "literal", value: "https://example.com" } },
        },
        { op: "configure_node", nodeId: "call", inputs: { nope: null } },
        { op: "configure_node", nodeId: "call", inputs: { url: null } },
      ],
    });

    expect(results.map((result) => result.status)).toEqual(["applied", "rejected", "applied"]);
    expect(results[1]).toMatchObject({ code: "unknown_input" });
    expect(state.nodes[2]?.data.inputs).toEqual({});
  });
});

describe("editVisualWorkflow", () => {
  it("returns what the page re-applies to the same end, and lists what it did", () => {
    const { context: after, output } = editVisualWorkflow(context(), {
      operations: [
        {
          op: "add_node",
          id: "slack",
          type: "action.notify_slack",
          after: { nodeId: "set", handle: null },
        },
        { op: "rename_workflow", name: "Nightly sync and notify" },
        { op: "remove_node", nodeId: "ghost" },
      ],
    });

    if (!output.applied) {
      throw new Error("expected the call to apply");
    }
    expect(output.editorSessionId).toBe("editor-1");
    expect(output.operations).toHaveLength(2);
    expect(output.changes).toEqual([
      { kind: "node_added", nodeId: "slack", type: "action.notify_slack" },
      {
        kind: "edge_added",
        source: "set",
        sourceHandle: null,
        target: "slack",
        targetHandle: null,
      },
      { kind: "workflow_renamed", name: "Nightly sync and notify" },
      { kind: "rejected", op: "remove_node", code: "unknown_node" },
    ]);
    expect(output.result.changed).toBe(true);
    expect(output.result.applied[0]).toContain("added Notify Slack [slack] after Set fields");
    expect(output.result.rejected[0]).toContain("ghost");
    expect(after?.definition.name).toBe("Nightly sync and notify");

    const { state, applied } = applyVisualWorkflowEditChanges({
      state: base,
      changes: [{ toolCallId: "call_1", change: output }],
      editorSessionId: "editor-1",
      appliedToolCallIds: new Set(),
    });
    expect(applied).toEqual([{ toolCallId: "call_1", made: 3 }]);
    expect(toVisualWorkflowV3Definition(state)).toEqual(after?.definition);
  });

  it("skips a change made for another editor or already applied", () => {
    const { output } = editVisualWorkflow(context(), {
      operations: [{ op: "rename_workflow", name: "Other" }],
    });
    const change = {
      toolCallId: "call_1",
      change: output as Extract<typeof output, { applied: true }>,
    };

    expect(
      applyVisualWorkflowEditChanges({
        state: base,
        changes: [change],
        editorSessionId: "editor-2",
        appliedToolCallIds: new Set(),
      }).applied,
    ).toEqual([]);
    expect(
      applyVisualWorkflowEditChanges({
        state: base,
        changes: [change],
        editorSessionId: "editor-1",
        appliedToolCallIds: new Set(["call_1"]),
      }).applied,
    ).toEqual([]);
  });

  it("says when no page is open", () => {
    expect(
      editVisualWorkflow(null, { operations: [{ op: "rename_workflow", name: "x" }] }).output,
    ).toMatchObject({
      applied: false,
      reason: "no_workflow_page_open",
    });
  });
});

describe("change lines and call parts", () => {
  it("reads a finished call, a running one and a refused one", () => {
    const { output } = editVisualWorkflow(context(), {
      operations: [{ op: "rename_workflow", name: "Renamed" }],
    });
    const part = {
      type: `tool-${EDIT_VISUAL_WORKFLOW_TOOL_NAME}`,
      state: "output-available",
      toolCallId: "call_1",
      input: {},
      output,
    };

    expect(summarizeVisualWorkflowEditCall(part)).toEqual({
      state: "done",
      changes: [{ kind: "workflow_renamed", name: "Renamed" }],
    });
    expect(summarizeVisualWorkflowEditCall({ ...part, state: "input-available" })).toEqual({
      state: "running",
    });
    expect(summarizeVisualWorkflowEditCall({ ...part, state: "output-error" })).toEqual({
      state: "failed",
    });
    expect(
      summarizeVisualWorkflowEditCall({ type: "tool-other", state: "output-available" }),
    ).toBeNull();
    // The change is the part of the output the page applies; the rest is for the reply.
    expect(collectVisualWorkflowEditChanges([part, { type: "text", text: "hi" }])).toEqual([
      {
        toolCallId: "call_1",
        change: {
          applied: true,
          editorSessionId: "editor-1",
          operations: [{ op: "rename_workflow", name: "Renamed" }],
        },
      },
    ]);
  });

  it("names a removed node by the type it had", () => {
    const { results } = applyVisualWorkflowEdits({
      state: base,
      operations: [{ op: "remove_node", nodeId: "set" }],
    });

    expect(toVisualWorkflowChangeLines(base, results)).toEqual([
      { kind: "node_removed", nodeId: "set", type: "logic.set" },
    ]);
  });
});

describe("page edits", () => {
  it("lists what the person changed, ignoring moves", () => {
    const after: VisualWorkflowEditorState = {
      name: "Moved",
      nodes: [
        { ...base.nodes[0]!, position: { x: 50, y: 50 } },
        {
          ...base.nodes[1]!,
          data: {
            ...base.nodes[1]!.data,
            config: { kind: "logic.set", assignments: [{ key: "a", value: "1" }] },
          },
        },
        node("slack", "action.notify_slack"),
      ],
      edges: [edge("set", "slack")],
    };

    const edits = listVisualWorkflowPageEdits(base, after);
    expect(edits).toEqual([
      { kind: "workflow_renamed", name: "Moved" },
      { kind: "node_configured", nodeId: "set", type: "logic.set", fields: ["assignments"] },
      { kind: "node_added", nodeId: "slack", type: "action.notify_slack" },
      {
        kind: "edge_added",
        source: "set",
        sourceHandle: "success",
        target: "slack",
        targetHandle: "input",
      },
      {
        kind: "edge_removed",
        source: "trigger",
        sourceHandle: "success",
        target: "set",
        targetHandle: "input",
      },
    ]);
    expect(describeVisualWorkflowPageEdits(edits)).toContain('now called "Moved"');
    expect(describeVisualWorkflowPageEdits(edits)).toContain("Set fields node [set]");
    expect(listVisualWorkflowPageEdits(base, { ...base, nodes: [...base.nodes] })).toEqual([]);
  });

  it("round-trips the workflow through a snapshot", () => {
    const snapshot = visualWorkflowEditor.snapshotData(base);
    const read = visualWorkflowEditor.readSnapshot(snapshot);

    expect(read && listVisualWorkflowPageEdits(base, read)).toEqual([]);
    expect(visualWorkflowEditor.readSnapshot({ form: {} })).toBeNull();
  });
});

describe("prompt text", () => {
  it("describes every node type with its outputs and settings", () => {
    const catalogue = describeVisualWorkflowCatalogue();

    expect(catalogue).toContain("type: action.notify_slack");
    expect(catalogue).toContain("title: Notify Slack");
    expect(catalogue).toContain("execution outputs: true, false");
    expect(catalogue).toContain("execution outputs: (none: the workflow ends here)");
    expect(catalogue).toContain('"message"');
    expect(catalogue).not.toContain("$schema");
  });

  it("describes the page with its nodes, connections and what stops activation", () => {
    const page = describeVisualWorkflowPage(context({ ...base, edges: [] }));

    expect(page).toContain('- Name: "Nightly sync"');
    expect(page).toContain('- Project: "Website"');
    expect(page).toContain("- id: set");
    expect(page).toContain("what: Set fields (logic.set)");
    expect(page).toContain("### Connections\n\n(none)");
    expect(page).toContain("orphan_node on node [set]");
  });
});
