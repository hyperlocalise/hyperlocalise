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

import type { VisualWorkflowV3Definition } from "../schema/types";
import { visualWorkflowDefinitionsEqual } from "./visual-workflow-definition-equality";

function definition(): VisualWorkflowV3Definition {
  return {
    schemaVersion: 3,
    name: "Lead ping",
    nodes: [
      { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
      {
        id: "slack",
        type: "action.notify_slack",
        config: { kind: "action.notify_slack", channelId: "C1", message: "Hello" },
      },
    ],
    edges: [
      {
        id: "e1",
        kind: "execution",
        source: "trigger",
        target: "slack",
        sourcePortId: "success",
        targetPortId: "input",
      },
    ],
    editor: { positions: { trigger: { x: 0, y: 0 }, slack: { x: 320, y: 0 } } },
  };
}

describe("visualWorkflowDefinitionsEqual", () => {
  it("matches the same content whatever order its keys were set in", () => {
    const reordered = definition();
    reordered.nodes[1] = {
      type: "action.notify_slack",
      config: { message: "Hello", kind: "action.notify_slack", channelId: "C1" },
      id: "slack",
    };

    expect(visualWorkflowDefinitionsEqual(definition(), reordered)).toBe(true);
  });

  it("ignores a key that is set to nothing", () => {
    const withEmptyKeys = definition();
    withEmptyKeys.nodes[1] = { ...withEmptyKeys.nodes[1]!, inputs: undefined };

    expect(visualWorkflowDefinitionsEqual(definition(), withEmptyKeys)).toBe(true);
  });

  it("tells a changed setting, a moved step, a new wire and a new name apart", () => {
    const setting = definition();
    setting.nodes[1] = {
      ...setting.nodes[1]!,
      config: { kind: "action.notify_slack", channelId: "C2", message: "Hello" },
    };
    const moved = definition();
    moved.editor.positions.slack = { x: 321, y: 0 };
    const wired = definition();
    wired.edges.push({
      id: "e2",
      kind: "data",
      source: "trigger",
      target: "slack",
      sourcePortId: "triggeredAt",
      targetPortId: "message",
    });
    const renamed = { ...definition(), name: "Lead ping 2" };

    for (const changed of [setting, moved, wired, renamed]) {
      expect(visualWorkflowDefinitionsEqual(definition(), changed)).toBe(false);
    }
  });
});
