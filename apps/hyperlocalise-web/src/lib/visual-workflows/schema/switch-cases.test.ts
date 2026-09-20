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
  ensureSwitchCasesWithIds,
  getSwitchCaseIndexByHandleId,
  legacySwitchCaseId,
  normalizeVisualWorkflowDefinition,
  pruneSwitchCaseEdges,
  remapLegacySwitchSourceHandle,
} from "./switch-cases";
import { validateVisualWorkflowDefinition } from "../validation/validate-workflow";

function legacySwitchDefinition(): VisualWorkflowDefinition {
  return {
    schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
    name: "Legacy switch",
    nodes: [
      { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
      {
        id: "switch",
        type: "logic.switch",
        config: {
          kind: "logic.switch",
          expression: "status",
          cases: [{ value: "pending" }, { value: "ready" }, { value: "done" }] as never,
        },
      },
      { id: "a", type: "logic.set", config: { kind: "logic.set", assignments: [] } },
      { id: "b", type: "logic.set", config: { kind: "logic.set", assignments: [] } },
      { id: "fallback", type: "logic.set", config: { kind: "logic.set", assignments: [] } },
    ],
    edges: [
      { id: "e0", source: "trigger", target: "switch", sourceHandle: null, targetHandle: null },
      { id: "e1", source: "switch", target: "a", sourceHandle: "0", targetHandle: null },
      { id: "e2", source: "switch", target: "b", sourceHandle: "1", targetHandle: null },
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
  it("keeps legacy ids under the sourceHandle length cap for max-length node ids", () => {
    const nodeId = "n".repeat(128);
    const id = legacySwitchCaseId(nodeId, 11);
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id).toBe(legacySwitchCaseId(nodeId, 11));
    expect(id).not.toBe(legacySwitchCaseId(`${nodeId}x`, 11));
  });

  it("assigns deterministic ids when cases are missing them", () => {
    const cases = ensureSwitchCasesWithIds("switch", [
      { value: "a" },
      { id: "keep-me", value: "b" },
    ]);
    expect(cases[0]?.id).toBe(legacySwitchCaseId("switch", 0));
    expect(cases[1]).toEqual({ id: "keep-me", value: "b" });
  });

  it("remaps in-range index handles and leaves out-of-range indexes unchanged", () => {
    const cases = ensureSwitchCasesWithIds("switch", [{ value: "a" }, { value: "b" }]);
    expect(remapLegacySwitchSourceHandle(cases, "1")).toBe(cases[1]?.id);
    expect(remapLegacySwitchSourceHandle(cases, "default")).toBe("default");
    expect(remapLegacySwitchSourceHandle(cases, cases[0]!.id)).toBe(cases[0]!.id);
    expect(remapLegacySwitchSourceHandle(cases, "2")).toBe("2");
    expect(remapLegacySwitchSourceHandle(cases, null)).toBeNull();
  });

  it("normalizes a three-case legacy graph and is idempotent", () => {
    const first = normalizeVisualWorkflowDefinition(legacySwitchDefinition());
    const switchNode = first.nodes.find((node) => node.id === "switch");
    if (switchNode?.config.kind !== "logic.switch") {
      throw new Error("expected switch node");
    }
    const [firstCase, secondCase] = switchNode.config.cases;
    expect(first.edges.find((edge) => edge.id === "e1")?.sourceHandle).toBe(firstCase?.id);
    expect(first.edges.find((edge) => edge.id === "e2")?.sourceHandle).toBe(secondCase?.id);
    expect(first.edges.find((edge) => edge.id === "e3")?.sourceHandle).toBe("default");
    expect(validateVisualWorkflowDefinition(first)).toEqual([]);
    expect(normalizeVisualWorkflowDefinition(first)).toEqual(first);
  });

  it("leaves an out-of-range legacy handle so validation can reject it", () => {
    const definition = legacySwitchDefinition();
    definition.edges.push({
      id: "bad",
      source: "switch",
      target: "a",
      sourceHandle: "2",
      targetHandle: null,
    });
    definition.nodes = definition.nodes.map((node) =>
      node.id === "switch" && node.config.kind === "logic.switch"
        ? {
            ...node,
            config: {
              ...node.config,
              cases: [{ value: "pending" }, { value: "ready" }] as never,
            },
          }
        : node,
    );
    const normalized = normalizeVisualWorkflowDefinition(definition);
    expect(normalized.edges.find((edge) => edge.id === "bad")?.sourceHandle).toBe("2");
    expect(validateVisualWorkflowDefinition(normalized).map((issue) => issue.code)).toContain(
      "invalid_handle",
    );
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
