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

export type VisualSwitchCase = {
  id: string;
  value: string;
};

export function createSwitchCaseId(): string {
  return crypto.randomUUID();
}

export function getSwitchCaseIndexByHandleId(
  cases: readonly VisualSwitchCase[],
  handleId: string,
): number | null {
  const index = cases.findIndex((entry) => entry.id === handleId);
  return index >= 0 ? index : null;
}

export function collectRemovedSwitchCaseIds(
  previousCases: readonly VisualSwitchCase[],
  nextCases: readonly VisualSwitchCase[],
): Set<string> {
  const nextIds = new Set(nextCases.map((entry) => entry.id));
  return new Set(previousCases.map((entry) => entry.id).filter((id) => !nextIds.has(id)));
}

export function pruneSwitchCaseEdges<T extends { source: string; sourceHandle?: string | null }>(
  edges: readonly T[],
  switchNodeId: string,
  removedCaseIds: ReadonlySet<string>,
): T[] {
  if (removedCaseIds.size === 0) {
    return [...edges];
  }
  return edges.filter(
    (edge) =>
      !(edge.source === switchNodeId && edge.sourceHandle && removedCaseIds.has(edge.sourceHandle)),
  );
}
