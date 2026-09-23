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
import type { VisualWorkflowRfEdge } from "../schema/types";

export function computeForEachBodyNodeIds(
  loopId: string,
  edges: readonly VisualWorkflowRfEdge[],
): string[] {
  const roots = edges
    .filter(
      (edge) =>
        edge.data?.kind !== "data" && edge.source === loopId && edge.sourceHandle === "each",
    )
    .map((edge) => edge.target)
    .filter((target): target is string => Boolean(target && target !== loopId));

  const body = new Set<string>(roots);
  const queue = [...roots];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const edge of edges) {
      if (edge.data?.kind === "data" || edge.source !== current) {
        continue;
      }

      const target = edge.target;

      if (!target || target === loopId || body.has(target)) {
        continue;
      }

      body.add(target);
      queue.push(target);
    }
  }

  return [...body];
}
