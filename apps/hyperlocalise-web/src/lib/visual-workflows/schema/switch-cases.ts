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

import type { CanonicalVisualWorkflowEdge, VisualWorkflowDefinition } from "./types";

export type VisualSwitchCase = {
  id: string;
  value: string;
};

export type VisualSwitchCaseDraft = {
  id?: string;
  value: string;
};

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const LEGACY_INDEX_HANDLE = /^\d+$/;

function fnv1a32(input: string): number {
  let hash = FNV_OFFSET;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

function toBase32Url(value: number): string {
  let remaining = value;
  let encoded = "";
  for (let index = 0; index < 7; index += 1) {
    encoded = `${BASE32_ALPHABET[remaining & 31]}${encoded}`;
    remaining >>>= 5;
  }
  return encoded;
}

export function createSwitchCaseId(): string {
  return crypto.randomUUID();
}

export function legacySwitchCaseId(nodeId: string, index: number): string {
  return `lc:${toBase32Url(fnv1a32(nodeId))}:${index}`;
}

export function ensureSwitchCasesWithIds(
  nodeId: string,
  cases: readonly VisualSwitchCaseDraft[],
): VisualSwitchCase[] {
  return cases.map((entry, index) => ({
    id: entry.id?.trim() ? entry.id : legacySwitchCaseId(nodeId, index),
    value: entry.value,
  }));
}

export function switchCasesNeedLegacyEdgeRemap(cases: readonly VisualSwitchCaseDraft[]): boolean {
  return cases.some((entry) => !entry.id?.trim());
}

export function preprocessVisualWorkflowDefinitionInput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.nodes) || !Array.isArray(record.edges)) {
    return value;
  }
  try {
    return normalizeVisualWorkflowDefinition(value as VisualWorkflowDefinition);
  } catch {
    return value;
  }
}

export function remapLegacySwitchSourceHandle(
  cases: readonly VisualSwitchCase[],
  sourceHandle: string | null,
): string | null {
  if (
    sourceHandle === null ||
    sourceHandle === "default" ||
    !LEGACY_INDEX_HANDLE.test(sourceHandle)
  ) {
    return sourceHandle;
  }
  const matched = cases[Number(sourceHandle)];
  return matched?.id ?? sourceHandle;
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

export function normalizeVisualWorkflowDefinition(
  definition: VisualWorkflowDefinition,
): VisualWorkflowDefinition {
  const legacyEdgeRemapBySwitchId = new Map<string, boolean>();

  const nodes = definition.nodes.map((node) => {
    if (node.config.kind !== "logic.switch") {
      return node;
    }
    legacyEdgeRemapBySwitchId.set(node.id, switchCasesNeedLegacyEdgeRemap(node.config.cases));
    return {
      ...node,
      config: {
        ...node.config,
        cases: ensureSwitchCasesWithIds(node.id, node.config.cases),
      },
    };
  });

  const switchCasesByNodeId = new Map(
    nodes.flatMap((node) =>
      node.config.kind === "logic.switch" ? [[node.id, node.config.cases] as const] : [],
    ),
  );

  const edges: CanonicalVisualWorkflowEdge[] = definition.edges.map((edge) => {
    const cases = switchCasesByNodeId.get(edge.source);
    if (!cases || !legacyEdgeRemapBySwitchId.get(edge.source)) {
      return edge;
    }
    const sourceHandle = remapLegacySwitchSourceHandle(cases, edge.sourceHandle);
    return sourceHandle === edge.sourceHandle ? edge : { ...edge, sourceHandle };
  });

  return {
    ...definition,
    nodes,
    edges,
  };
}
