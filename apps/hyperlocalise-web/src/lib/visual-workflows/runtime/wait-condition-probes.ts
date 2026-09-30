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
import type { VisualWorkflowV3Definition } from "../schema/types";
import type { WaitResumeState } from "./wait-schedule";

const NODE_TEMPLATE_REFERENCE = /\{\{\s*nodes\.([^.}\s]+)\./g;

/** Nodes whose output must be refreshed before a durable condition poll. */
export function collectWaitConditionProbeNodeIds(
  definition: VisualWorkflowV3Definition,
  resume: WaitResumeState | null,
): Set<string> {
  if (!resume || resume.mode !== "condition") return new Set();

  const waitNode = definition.nodes.find((node) => node.id === resume.waitNodeId);
  if (!waitNode || waitNode.config.kind !== "flow.wait") return new Set();

  const probeIds = new Set<string>();
  const addProbe = (nodeId: string) => probeIds.add(nodeId);
  const binding = waitNode.inputs?.condition;
  if (binding?.kind === "reference") addProbe(binding.nodeId);

  for (const edge of definition.edges) {
    if (edge.kind === "data" && edge.target === waitNode.id && edge.targetPortId === "condition") {
      addProbe(edge.source);
    }
  }

  const condition = waitNode.config.condition;
  if (typeof condition === "string") {
    for (const match of condition.matchAll(NODE_TEMPLATE_REFERENCE)) {
      if (match[1]) addProbe(match[1]);
    }
  }

  return probeIds;
}

/** Probe refresh is only active while the durable wait has not settled yet. */
export function resolveActiveWaitConditionProbeNodeIds(input: {
  definition: VisualWorkflowV3Definition;
  waitResume: WaitResumeState | null;
  nodeRuns: Array<{ nodeId: string; iteration: number; status: string }>;
}): Set<string> {
  if (!input.waitResume) return new Set();

  const waitAlreadySettled = input.nodeRuns.some(
    (record) =>
      record.nodeId === input.waitResume!.waitNodeId &&
      record.iteration === input.waitResume!.iteration &&
      record.status === "succeeded",
  );

  if (waitAlreadySettled) return new Set();

  return collectWaitConditionProbeNodeIds(input.definition, input.waitResume);
}
