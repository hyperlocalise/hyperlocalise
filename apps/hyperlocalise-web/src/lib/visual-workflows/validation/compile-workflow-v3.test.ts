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

import {
  compileVisualWorkflowV3Definition,
  toVisualWorkflowExecutionDefinition,
} from "./compile-workflow-v3";
import type { VisualWorkflowV3Definition } from "../schema/types";

function definition(edges: VisualWorkflowV3Definition["edges"]): VisualWorkflowV3Definition {
  return {
    schemaVersion: 3,
    name: "V3 compiler",
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        config: {
          kind: "trigger.manual",
        },
      },
      {
        id: "set",
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
        set: { x: 240, y: 0 },
      },
    },
  };
}

describe("compileVisualWorkflowV3Definition", () => {
  it("compiles a data edge into the existing WorkflowBinding model", () => {
    const result = compileVisualWorkflowV3Definition(
      definition([
        {
          id: "execution",
          kind: "execution",
          source: "trigger",
          target: "set",
          sourcePortId: "success",
          targetPortId: "input",
        },
        {
          id: "data",
          kind: "data",
          source: "trigger",
          target: "set",
          sourcePortId: "triggeredAt",
          targetPortId: "value",
        },
      ]),
    );

    expect(result.issues).toEqual([]);
    expect(result.definition.nodes[1]?.inputs).toEqual({
      value: {
        kind: "reference",
        nodeId: "trigger",
        path: ["triggeredAt"],
      },
    });
  });

  it("does not include data edges in the execution graph", () => {
    const result = compileVisualWorkflowV3Definition(
      definition([
        {
          id: "data-only",
          kind: "data",
          source: "trigger",
          target: "set",
          sourcePortId: "triggeredAt",
          targetPortId: "value",
        },
      ]),
    );

    expect(result.issues).toEqual([]);
    expect(result.executionEdges).toEqual([]);
  });
});

it("rejects a data edge whose source is an execution port", () => {
  const result = compileVisualWorkflowV3Definition(
    definition([
      {
        id: "invalid-data-source",
        kind: "data",
        source: "trigger",
        target: "set",
        sourcePortId: "success",
        targetPortId: "value",
      },
    ]),
  );

  expect(result.issues).toContainEqual({
    code: "invalid_source_port",
    edgeId: "invalid-data-source",
    nodeId: "trigger",
  });

  expect(result.definition.nodes[1]?.inputs).toBeUndefined();
});

it("rejects a data edge whose target is an execution port", () => {
  const result = compileVisualWorkflowV3Definition(
    definition([
      {
        id: "invalid-data-target",
        kind: "data",
        source: "trigger",
        target: "set",
        sourcePortId: "triggeredAt",
        targetPortId: "input",
      },
    ]),
  );

  expect(result.issues).toContainEqual({
    code: "invalid_target_port",
    edgeId: "invalid-data-target",
    nodeId: "set",
  });

  expect(result.definition.nodes[1]?.inputs).toBeUndefined();
});

it("rejects an execution edge whose source is a data port", () => {
  const result = compileVisualWorkflowV3Definition(
    definition([
      {
        id: "invalid-execution-source",
        kind: "execution",
        source: "trigger",
        target: "set",
        sourcePortId: "triggeredAt",
        targetPortId: "input",
      },
    ]),
  );

  expect(result.issues).toContainEqual({
    code: "invalid_source_port",
    edgeId: "invalid-execution-source",
    nodeId: "trigger",
  });

  expect(result.executionEdges).toEqual([]);
});

it("rejects an execution edge whose target is a data port", () => {
  const result = compileVisualWorkflowV3Definition(
    definition([
      {
        id: "invalid-execution-target",
        kind: "execution",
        source: "trigger",
        target: "set",
        sourcePortId: "success",
        targetPortId: "value",
      },
    ]),
  );

  expect(result.issues).toContainEqual({
    code: "invalid_target_port",
    edgeId: "invalid-execution-target",
    nodeId: "set",
  });

  expect(result.executionEdges).toEqual([]);
});

it("accepts a Switch execution port identified by its stable case ID", () => {
  const input = definition([
    {
      id: "switch-case-ready",
      kind: "execution",
      source: "switch",
      target: "set",
      sourcePortId: "case-ready",
      targetPortId: "input",
    },
  ]);

  input.nodes.splice(1, 0, {
    id: "switch",
    type: "logic.switch",
    config: {
      kind: "logic.switch",
      expression: "status",
      cases: [{ id: "case-ready", value: "ready" }],
    },
  });
  input.editor.positions.switch = { x: 120, y: 0 };

  const result = compileVisualWorkflowV3Definition(input);

  expect(result.issues).not.toContainEqual({
    code: "invalid_source_port",
    edgeId: "switch-case-ready",
    nodeId: "switch",
  });
  expect(result.executionEdges).toContainEqual(input.edges[0]);
});

it("rejects a data edge that conflicts with an existing input binding", () => {
  const input = definition([
    {
      id: "conflicting-data",
      kind: "data",
      source: "trigger",
      target: "set",
      sourcePortId: "triggeredAt",
      targetPortId: "value",
    },
  ]);

  input.nodes[1] = {
    ...input.nodes[1]!,
    inputs: {
      value: {
        kind: "literal",
        value: "existing value",
      },
    },
  };

  const result = compileVisualWorkflowV3Definition(input);

  expect(result.issues).toContainEqual({
    code: "conflicting_data_input",
    edgeId: "conflicting-data",
    nodeId: "set",
  });

  expect(result.definition.nodes[1]?.inputs?.value).toEqual({
    kind: "literal",
    value: "existing value",
  });
});

it("rejects incompatible source and target data port types", () => {
  const input: VisualWorkflowV3Definition = {
    schemaVersion: 3,
    name: "Incompatible data types",
    nodes: [
      {
        id: "source",
        type: "logic.set",
        config: {
          kind: "logic.set",
          assignments: [],
        },
        outputFields: [
          {
            path: "count",
            type: "number",
          },
        ],
      },
      {
        id: "target",
        type: "action.http",
        config: {
          kind: "action.http",
          method: "GET",
          url: "",
        },
      },
    ],
    edges: [
      {
        id: "number-to-string",
        kind: "data",
        source: "source",
        target: "target",
        sourcePortId: "count",
        targetPortId: "url",
      },
    ],
    editor: {
      positions: {
        source: { x: 0, y: 0 },
        target: { x: 240, y: 0 },
      },
    },
  };

  const result = compileVisualWorkflowV3Definition(input);

  expect(result.issues).toContainEqual({
    code: "incompatible_data_types",
    edgeId: "number-to-string",
    nodeId: "target",
  });

  expect(result.definition.nodes[1]?.inputs).toBeUndefined();
});

it("reports cycles formed by execution edges", () => {
  const input: VisualWorkflowV3Definition = {
    schemaVersion: 3,
    name: "Execution cycle",
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        config: {
          kind: "trigger.manual",
        },
      },
      {
        id: "a",
        type: "logic.set",
        config: {
          kind: "logic.set",
          assignments: [],
        },
      },
      {
        id: "b",
        type: "logic.set",
        config: {
          kind: "logic.set",
          assignments: [],
        },
      },
    ],
    edges: [
      {
        id: "trigger-a",
        kind: "execution",
        source: "trigger",
        target: "a",
        sourcePortId: "success",
        targetPortId: "input",
      },
      {
        id: "a-b",
        kind: "execution",
        source: "a",
        target: "b",
        sourcePortId: "success",
        targetPortId: "input",
      },
      {
        id: "b-a",
        kind: "execution",
        source: "b",
        target: "a",
        sourcePortId: "success",
        targetPortId: "input",
      },
    ],
    editor: {
      positions: {
        trigger: { x: 0, y: 0 },
        a: { x: 240, y: 0 },
        b: { x: 480, y: 0 },
      },
    },
  };

  const result = compileVisualWorkflowV3Definition(input);

  expect(result.issues).toContainEqual({
    code: "execution_cycle",
  });
});

it("does not treat a data dependency cycle as an execution cycle", () => {
  const input: VisualWorkflowV3Definition = {
    schemaVersion: 3,
    name: "Data cycle",
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        config: {
          kind: "trigger.manual",
        },
      },
      {
        id: "a",
        type: "logic.set",
        config: {
          kind: "logic.set",
          assignments: [],
        },
        outputFields: [
          {
            path: "value",
            type: "string",
          },
        ],
      },
      {
        id: "b",
        type: "logic.set",
        config: {
          kind: "logic.set",
          assignments: [],
        },
        outputFields: [
          {
            path: "value",
            type: "string",
          },
        ],
      },
    ],
    edges: [
      {
        id: "trigger-a",
        kind: "execution",
        source: "trigger",
        target: "a",
        sourcePortId: "success",
        targetPortId: "input",
      },
      {
        id: "a-b-data",
        kind: "data",
        source: "a",
        target: "b",
        sourcePortId: "value",
        targetPortId: "fromA",
      },
      {
        id: "b-a-data",
        kind: "data",
        source: "b",
        target: "a",
        sourcePortId: "value",
        targetPortId: "fromB",
      },
    ],
    editor: {
      positions: {
        trigger: { x: 0, y: 0 },
        a: { x: 240, y: 0 },
        b: { x: 480, y: 0 },
      },
    },
  };

  const result = compileVisualWorkflowV3Definition(input);

  expect(result.issues).not.toContainEqual({
    code: "execution_cycle",
  });
});

it("reports a data edge whose endpoint does not exist", () => {
  const result = compileVisualWorkflowV3Definition(
    definition([
      {
        id: "missing-source",
        kind: "data",
        source: "missing",
        target: "set",
        sourcePortId: "value",
        targetPortId: "value",
      },
    ]),
  );

  expect(result.issues).toContainEqual({
    code: "invalid_edge",
    edgeId: "missing-source",
  });

  expect(result.definition.nodes[1]?.inputs).toBeUndefined();
});

it("rejects all data edges that target the same input", () => {
  const result = compileVisualWorkflowV3Definition(
    definition([
      {
        id: "first-data",
        kind: "data",
        source: "trigger",
        target: "set",
        sourcePortId: "triggeredAt",
        targetPortId: "value",
      },
      {
        id: "second-data",
        kind: "data",
        source: "trigger",
        target: "set",
        sourcePortId: "triggeredAt",
        targetPortId: "value",
      },
    ]),
  );

  expect(result.issues).toEqual(
    expect.arrayContaining([
      {
        code: "conflicting_data_input",
        edgeId: "first-data",
        nodeId: "set",
      },
      {
        code: "conflicting_data_input",
        edgeId: "second-data",
        nodeId: "set",
      },
    ]),
  );

  expect(result.definition.nodes[1]?.inputs).toBeUndefined();
});

it("derives For Each execution membership from v3 execution edges", () => {
  const definition: VisualWorkflowV3Definition = {
    schemaVersion: 3,
    name: "Graph-derived loop",
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        config: {
          kind: "trigger.manual",
        },
      },
      {
        id: "loop",
        type: "logic.for_each",
        config: {
          kind: "logic.for_each",
          collection: "[]",
        },
        bodyNodeIds: ["stale"],
      },
      {
        id: "body",
        type: "logic.set",
        config: {
          kind: "logic.set",
          assignments: [],
        },
      },
      {
        id: "after",
        type: "logic.set",
        config: {
          kind: "logic.set",
          assignments: [],
        },
      },
    ],
    edges: [
      {
        id: "trigger-loop",
        kind: "execution",
        source: "trigger",
        target: "loop",
        sourcePortId: "success",
        targetPortId: "input",
      },
      {
        id: "loop-body",
        kind: "execution",
        source: "loop",
        target: "body",
        sourcePortId: "each",
        targetPortId: "input",
      },
      {
        id: "loop-after",
        kind: "execution",
        source: "loop",
        target: "after",
        sourcePortId: "done",
        targetPortId: "input",
      },
      {
        id: "body-after-data",
        kind: "data",
        source: "body",
        target: "after",
        sourcePortId: "value",
        targetPortId: "value",
      },
    ],
    editor: {
      positions: {},
    },
  };

  const compiled = compileVisualWorkflowV3Definition(definition);
  const executionDefinition = toVisualWorkflowExecutionDefinition(compiled);

  expect(executionDefinition.nodes.find((node) => node.id === "loop")?.bodyNodeIds).toEqual([
    "body",
  ]);
});
