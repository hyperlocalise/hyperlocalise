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
import type {
  VisualCatalogType,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "../schema/types";
import { listStepReads, type VisualWorkflowTestSetup } from "./visual-workflow-test-data";

/**
 * The id of a new step, readable where it shows: in a setting's text as `nodes.<id>.<path>`, in
 * the exported workflow and in run history. It is the step's kind, such as `notify_slack`, with
 * a number when the workflow already has one or the id is `reserved`.
 */
export function nextVisualWorkflowNodeId(
  type: VisualCatalogType,
  nodes: readonly Pick<VisualWorkflowRfNode, "id">[],
  reserved: Iterable<string> = [],
): string {
  const base = type.slice(type.indexOf(".") + 1);
  const taken = new Set([...nodes.map((node) => node.id), ...reserved]);
  if (!taken.has(base)) return base;
  for (let count = 2; ; count += 1) {
    const candidate = `${base}_${count}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * The ids a new step must not take although no step on the canvas has them. A step's id keys its
 * test data and is how other steps read it, so reusing a deleted step's id would hand the new
 * step that step's test setup and point its leftover references at the new one. Reserved are
 * the ids of every step seen since the editor opened, every id another step still reads, and
 * every id the test setup holds an entry for.
 */
export function reservedVisualWorkflowNodeIds({
  nodes,
  edges,
  setup,
  seenNodeIds,
}: {
  nodes: readonly VisualWorkflowRfNode[];
  edges: readonly VisualWorkflowRfEdge[];
  setup: VisualWorkflowTestSetup;
  seenNodeIds: Iterable<string>;
}): Set<string> {
  return new Set([
    ...seenNodeIds,
    ...listStepReads(nodes, edges).map((read) => read.nodeId),
    ...Object.keys(setup.data),
    ...Object.keys(setup.failures),
    ...setup.realNodeIds,
  ]);
}
