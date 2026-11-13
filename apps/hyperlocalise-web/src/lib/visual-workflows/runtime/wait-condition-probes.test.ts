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
import {
  collectWaitConditionProbeNodeIds,
  resolveActiveWaitConditionProbeNodeIds,
} from "./wait-condition-probes";

const resume = {
  waitNodeId: "wait",
  iteration: -1,
  mode: "condition" as const,
  scheduledAt: "2026-09-28T00:00:00.000Z",
  wakeAt: "2026-09-28T00:00:05.000Z",
};

function definition(condition: string): VisualWorkflowV3Definition {
  return {
    schemaVersion: 3,
    name: "Wait probe",
    nodes: [
      {
        id: "probe",
        type: "action.http",
        config: { kind: "action.http", method: "GET", url: "https://example.test/status" },
      },
      {
        id: "wait",
        type: "flow.wait",
        config: {
          kind: "flow.wait",
          mode: "condition",
          condition,
          pollingIntervalMs: 5_000,
          timeoutMs: 60_000,
        },
      },
    ],
    edges: [],
    editor: { positions: { probe: { x: 0, y: 0 }, wait: { x: 300, y: 0 } } },
  };
}

describe("collectWaitConditionProbeNodeIds", () => {
  it("refreshes nodes referenced by an inline condition on every poll", () => {
    expect(
      collectWaitConditionProbeNodeIds(definition("{{nodes.probe.json.status}} === ready"), resume),
    ).toEqual(new Set(["probe"]));
  });

  it("refreshes the source of a condition data binding", () => {
    const workflow = definition("");
    workflow.nodes[1]!.inputs = {
      condition: { kind: "reference", nodeId: "probe", path: ["json", "ready"] },
    };

    expect(collectWaitConditionProbeNodeIds(workflow, resume)).toEqual(new Set(["probe"]));
  });

  it("refreshes the direct v3 data-edge source", () => {
    const workflow = definition("");
    workflow.nodes.unshift({
      id: "trigger",
      type: "trigger.manual",
      config: { kind: "trigger.manual" },
    });
    workflow.edges = [
      {
        id: "trigger-probe",
        kind: "data",
        source: "trigger",
        target: "probe",
        sourcePortId: "triggeredAt",
        targetPortId: "url",
      },
      {
        id: "probe-wait",
        kind: "data",
        source: "probe",
        target: "wait",
        sourcePortId: "ok",
        targetPortId: "condition",
      },
    ];

    expect(collectWaitConditionProbeNodeIds(workflow, resume)).toEqual(new Set(["probe"]));
  });

  it("does not refresh probes for duration waits", () => {
    expect(
      collectWaitConditionProbeNodeIds(definition("{{nodes.probe.json.ready}}"), {
        ...resume,
        mode: "duration",
      }),
    ).toEqual(new Set());
  });
});

describe("resolveActiveWaitConditionProbeNodeIds", () => {
  it("refreshes probes while the wait is still outstanding", () => {
    expect(
      resolveActiveWaitConditionProbeNodeIds({
        definition: definition("{{nodes.probe.json.status}} === ready"),
        waitResume: resume,
        nodeRuns: [],
      }),
    ).toEqual(new Set(["probe"]));
  });

  it("stops refreshing probes after the wait has settled", () => {
    expect(
      resolveActiveWaitConditionProbeNodeIds({
        definition: definition("{{nodes.probe.json.status}} === ready"),
        waitResume: resume,
        nodeRuns: [{ nodeId: "wait", iteration: -1, status: "succeeded" }],
      }),
    ).toEqual(new Set());
  });

  it("keeps refreshing when a different wait iteration settled", () => {
    expect(
      resolveActiveWaitConditionProbeNodeIds({
        definition: definition("{{nodes.probe.json.status}} === ready"),
        waitResume: { ...resume, iteration: 2 },
        nodeRuns: [{ nodeId: "wait", iteration: 1, status: "succeeded" }],
      }),
    ).toEqual(new Set(["probe"]));
  });
});
