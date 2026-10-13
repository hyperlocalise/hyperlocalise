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
import type { VisualWorkflowRfNode } from "../schema/types";
import { markFreshVisualWorkflowSteps } from "./visual-workflow-fresh-steps";

function node(id: string, extra: Partial<VisualWorkflowRfNode> = {}): VisualWorkflowRfNode {
  return {
    id,
    type: "logic.set",
    position: { x: 0, y: 0 },
    data: { catalogType: "logic.set", config: createDefaultConfig("logic.set"), runStatus: "idle" },
    ...extra,
  };
}

const none: ReadonlySet<string> = new Set();

describe("markFreshVisualWorkflowSteps", () => {
  it("marks a step that appears", () => {
    const marked = markFreshVisualWorkflowSteps({
      marked: none,
      previous: [node("a")],
      next: [node("a"), node("b")],
      selectedNodeId: null,
    });
    expect([...marked]).toEqual(["b"]);
  });

  it("does not mark a step that appears selected, by the canvas or by its open settings", () => {
    expect(
      markFreshVisualWorkflowSteps({
        marked: none,
        previous: [node("a")],
        next: [node("a"), node("b", { selected: true })],
        selectedNodeId: null,
      }).size,
    ).toBe(0);
    expect(
      markFreshVisualWorkflowSteps({
        marked: none,
        previous: [node("a")],
        next: [node("a"), node("b")],
        selectedNodeId: "b",
      }).size,
    ).toBe(0);
  });

  it("keeps a mark until the step is selected, and not after", () => {
    const marked = new Set(["b"]);
    const steps = [node("a"), node("b")];
    expect(
      markFreshVisualWorkflowSteps({ marked, previous: steps, next: steps, selectedNodeId: "a" }),
    ).toBe(marked);
    const selected = [node("a"), node("b", { selected: true })];
    const cleared = markFreshVisualWorkflowSteps({
      marked,
      previous: steps,
      next: selected,
      selectedNodeId: "b",
    });
    expect(cleared.size).toBe(0);
    expect(
      markFreshVisualWorkflowSteps({
        marked: cleared,
        previous: selected,
        next: steps,
        selectedNodeId: null,
      }).size,
    ).toBe(0);
  });

  it("drops the mark of a step that is gone and marks it again when it comes back", () => {
    const gone = markFreshVisualWorkflowSteps({
      marked: new Set(["b"]),
      previous: [node("a"), node("b")],
      next: [node("a")],
      selectedNodeId: null,
    });
    expect(gone.size).toBe(0);
    const back = markFreshVisualWorkflowSteps({
      marked: gone,
      previous: [node("a")],
      next: [node("a"), node("b")],
      selectedNodeId: null,
    });
    expect([...back]).toEqual(["b"]);
  });

  it("marks a step whose settings or type change while it is not selected", () => {
    const configured = node("a", {
      data: {
        catalogType: "logic.set",
        config: { kind: "logic.set", assignments: [{ key: "greeting", value: "hello" }] },
        runStatus: "idle",
      },
    });
    expect([
      ...markFreshVisualWorkflowSteps({
        marked: none,
        previous: [node("a")],
        next: [configured],
        selectedNodeId: null,
      }),
    ]).toEqual(["a"]);
    const retyped = node("a", {
      type: "logic.if",
      data: { catalogType: "logic.if", config: createDefaultConfig("logic.if"), runStatus: "idle" },
    });
    expect([
      ...markFreshVisualWorkflowSteps({
        marked: none,
        previous: [node("a")],
        next: [retyped],
        selectedNodeId: null,
      }),
    ]).toEqual(["a"]);
    expect(
      markFreshVisualWorkflowSteps({
        marked: none,
        previous: [node("a")],
        next: [configured],
        selectedNodeId: "a",
      }).size,
    ).toBe(0);
  });

  it("does not mark a move, a test run's marks or a change to a loop's body steps", () => {
    const loop = node("a", {
      type: "logic.for_each",
      data: {
        catalogType: "logic.for_each",
        config: createDefaultConfig("logic.for_each"),
        runStatus: "idle",
      },
    });
    const later = [
      { ...loop, position: { x: 40, y: 80 } },
      { ...loop, data: { ...loop.data, runStatus: "succeeded" as const, lastOutput: { n: 1 } } },
      { ...loop, data: { ...loop.data, bodyNodeIds: ["b"] } },
    ];
    for (const next of later) {
      expect(
        markFreshVisualWorkflowSteps({
          marked: none,
          previous: [loop],
          next: [next],
          selectedNodeId: null,
        }).size,
      ).toBe(0);
    }
  });

  it("returns the same set when nothing changes", () => {
    const steps = [node("a")];
    expect(
      markFreshVisualWorkflowSteps({
        marked: none,
        previous: steps,
        next: steps,
        selectedNodeId: null,
      }),
    ).toBe(none);
  });
});
