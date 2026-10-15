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
import { isTriggerType } from "@/lib/visual-workflows/catalog/node-catalog";
import {
  splitTemplate,
  upstreamNodeIds,
} from "@/lib/visual-workflows/editor/visual-workflow-upstream-fields";
import type {
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "@/lib/visual-workflows/schema/types";

/** A field reference in a step's settings that the run cannot read when the step runs. */
export type VisualWorkflowReferenceProblem = {
  /** The step whose settings hold the reference. */
  nodeId: string;
  /** The reference as written, such as `{{ nodes.http.status }}`. */
  reference: string;
  reason: "unknown_step" | "not_earlier" | "no_trigger";
};

const MAX_DEPTH = 6;

function collectStrings(value: unknown, into: string[], depth: number) {
  if (depth > MAX_DEPTH) return;
  if (typeof value === "string") {
    into.push(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, into, depth + 1);
  } else if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectStrings(entry, into, depth + 1);
  }
}

/**
 * Every `{{ nodes.<id>.<path> }}` in a step's settings that reads a step that is not there or
 * does not run before it, and every `{{ trigger.<path> }}` in a workflow with no trigger. Each
 * would stop the run at that step. Expressions the editor does not know, such as a loop's
 * current item, are left alone.
 */
export function findVisualWorkflowReferenceProblems({
  nodes,
  edges,
}: {
  nodes: readonly VisualWorkflowRfNode[];
  edges: readonly VisualWorkflowRfEdge[];
}): VisualWorkflowReferenceProblem[] {
  const ids = new Set(nodes.map((node) => node.id));
  const hasTrigger = nodes.some((node) => isTriggerType(node.data.catalogType));
  const problems: VisualWorkflowReferenceProblem[] = [];
  for (const node of nodes) {
    const texts: string[] = [];
    collectStrings(node.data.config, texts, 0);
    const references = texts.flatMap((text) =>
      splitTemplate(text).flatMap((segment) => (segment.kind === "reference" ? [segment] : [])),
    );
    if (references.length === 0) continue;
    const upstream = upstreamNodeIds(node.id, edges);
    for (const segment of references) {
      const reason = segment.trigger
        ? hasTrigger
          ? null
          : "no_trigger"
        : segment.nodeId === null
          ? null
          : !ids.has(segment.nodeId)
            ? "unknown_step"
            : upstream.has(segment.nodeId)
              ? null
              : "not_earlier";
      if (
        reason &&
        !problems.some(
          (problem) => problem.nodeId === node.id && problem.reference === segment.raw,
        )
      ) {
        problems.push({ nodeId: node.id, reference: segment.raw, reason });
      }
    }
  }
  return problems;
}
