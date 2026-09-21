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

import { visualWorkflowDefinitionSchema } from "./definition-schema";
import { VISUAL_WORKFLOW_SCHEMA_VERSION, type VisualWorkflowDefinition } from "./types";
import {
  collectRemovedSwitchCaseIds,
  createSwitchCaseId,
  getSwitchCaseIndexByHandleId,
  pruneSwitchCaseEdges,
} from "./switch-cases";
import { validateVisualWorkflowDefinition } from "../validation/validate-workflow";

function switchDefinitionWithIds(): VisualWorkflowDefinition {
  const casePending = "case-pending";
  const caseReady = "case-ready";
  return {
    schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
    name: "Switch",
    nodes: [
      { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
      {
        id: "switch",
        type: "logic.switch",
        config: {
          kind: "logic.switch",
          expression: "status",
          cases: [
            { id: casePending, value: "pending" },
            { id: caseReady, value: "ready" },
            { id: "case-done", value: "done" },
          ],
        },
      },
      { id: "a", type: "logic.set", config: { kind: "logic.set", assignments: [] } },
      { id: "b", type: "logic.set", config: { kind: "logic.set", assignments: [] } },
      { id: "fallback", type: "logic.set", config: { kind: "logic.set", assignments: [] } },
    ],
    edges: [
      { id: "e0", source: "trigger", target: "switch", sourceHandle: null, targetHandle: null },
      { id: "e1", source: "switch", target: "a", sourceHandle: casePending, targetHandle: null },
      { id: "e2", source: "switch", target: "b", sourceHandle: caseReady, targetHandle: null },
      {
        id: "e3",
        source: "switch",
        target: "fallback",
        sourceHandle: "default",
        targetHandle: null,
      },
    ],
    editor: { positions: {} },
  };
}

describe("switch case identifiers", () => {
  it("rejects switch cases without ids in the definition schema", () => {
    const parsed = visualWorkflowDefinitionSchema.safeParse({
      schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
      name: "Legacy",
      nodes: [
        {
          id: "switch",
          type: "logic.switch",
          config: {
            kind: "logic.switch",
            expression: "x",
            cases: [{ value: "a" }],
          },
        },
      ],
      edges: [],
      editor: { positions: {} },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects index-based source handles when cases use stable ids", () => {
    const definition = switchDefinitionWithIds();
    definition.edges.push({
      id: "bad",
      source: "switch",
      target: "a",
      sourceHandle: "0",
      targetHandle: null,
    });
    expect(validateVisualWorkflowDefinition(definition).map((issue) => issue.code)).toContain(
      "invalid_handle",
    );
  });

  it("accepts numeric case ids without remapping edges", () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
      name: "Numeric ids",
      nodes: [
        { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
        {
          id: "switch",
          type: "logic.switch",
          config: {
            kind: "logic.switch",
            expression: "status",
            cases: [
              { id: "1", value: "first" },
              { id: "other", value: "second" },
            ],
          },
        },
        { id: "target", type: "logic.set", config: { kind: "logic.set", assignments: [] } },
      ],
      edges: [
        { id: "e0", source: "trigger", target: "switch", sourceHandle: null, targetHandle: null },
        { id: "e1", source: "switch", target: "target", sourceHandle: "1", targetHandle: null },
      ],
      editor: { positions: {} },
    };
    expect(definition.edges.find((edge) => edge.id === "e1")?.sourceHandle).toBe("1");
    expect(validateVisualWorkflowDefinition(definition)).toEqual([]);
  });

  it("validates a three-case switch graph wired by case id", () => {
    const definition = switchDefinitionWithIds();
    expect(validateVisualWorkflowDefinition(definition)).toEqual([]);
  });

  it("prunes only edges for deleted case ids", () => {
    const previous = [
      { id: "keep-left", value: "a" },
      { id: "drop-middle", value: "b" },
      { id: "keep-right", value: "c" },
    ];
    const next = [previous[0]!, previous[2]!];
    const removed = collectRemovedSwitchCaseIds(previous, next);
    expect([...removed]).toEqual(["drop-middle"]);
    const edges = pruneSwitchCaseEdges(
      [
        { id: "e1", source: "switch", sourceHandle: "keep-left" },
        { id: "e2", source: "switch", sourceHandle: "drop-middle" },
        { id: "e3", source: "switch", sourceHandle: "keep-right" },
        { id: "e4", source: "other", sourceHandle: "drop-middle" },
      ],
      "switch",
      removed,
    );
    expect(edges.map((edge) => edge.id)).toEqual(["e1", "e3", "e4"]);
  });

  it("rejects duplicate case ids in the definition schema", () => {
    const parsed = visualWorkflowDefinitionSchema.safeParse({
      schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
      name: "Dup",
      nodes: [
        {
          id: "switch",
          type: "logic.switch",
          config: {
            kind: "logic.switch",
            expression: "x",
            cases: [
              { id: "same", value: "a" },
              { id: "same", value: "b" },
            ],
          },
        },
      ],
      edges: [],
      editor: { positions: {} },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects the reserved default case id", () => {
    const parsed = visualWorkflowDefinitionSchema.safeParse({
      schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
      name: "Reserved",
      nodes: [
        {
          id: "switch",
          type: "logic.switch",
          config: {
            kind: "logic.switch",
            expression: "x",
            cases: [{ id: "default", value: "a" }],
          },
        },
      ],
      edges: [],
      editor: { positions: {} },
    });
    expect(parsed.success).toBe(false);
  });

  it("looks up case index by handle id", () => {
    const cases = [
      { id: "alpha", value: "a" },
      { id: "beta", value: "b" },
    ];
    expect(getSwitchCaseIndexByHandleId(cases, "beta")).toBe(1);
    expect(getSwitchCaseIndexByHandleId(cases, "missing")).toBeNull();
  });

  it("creates unique ids for new cases", () => {
    expect(createSwitchCaseId()).not.toBe(createSwitchCaseId());
    expect(createSwitchCaseId().length).toBeLessThanOrEqual(64);
  });
});
