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
import { isTriggerType } from "../catalog/node-catalog";
import { getWorkflowOutputFields } from "../catalog/node-contracts";
import { readWorkflowPath } from "../runtime/bindings";
import type {
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
  WorkflowValueType,
} from "../schema/types";
import type { VisualWorkflowTestData } from "./visual-workflow-test-data";

/** A field an earlier step gives, as a later step's text can read it. */
export type UpstreamField = {
  nodeId: string;
  /** The step is the trigger, whose fields a template reads as `trigger.<path>`. */
  trigger: boolean;
  path: string;
  type: WorkflowValueType;
  optional: boolean;
  /** Seen in a run's output or in test data, not declared by the step. */
  observed: boolean;
  /** The field's value in the last run or in test data, when there is one. */
  sample: unknown;
};

const OBSERVED_DEPTH = 4;
const OBSERVED_LIMIT = 50;

/** The fields found in a value, such as a step's output, a few levels deep. */
export function observedOutputFields(
  value: unknown,
): { path: string; type: WorkflowValueType; optional: boolean }[] {
  const fields: { path: string; type: WorkflowValueType; optional: boolean }[] = [];
  const visit = (current: unknown, path: string[], depth: number) => {
    if (depth > OBSERVED_DEPTH || fields.length >= OBSERVED_LIMIT) return;
    if (!current || typeof current !== "object" || Array.isArray(current)) return;
    for (const [key, entry] of Object.entries(current)) {
      if (fields.length >= OBSERVED_LIMIT) break;
      const next = [...path, key];
      fields.push({ path: next.join("."), type: valueType(entry), optional: true });
      visit(entry, next, depth + 1);
    }
  };
  visit(value, [], 0);
  return fields;
}

function valueType(value: unknown): WorkflowValueType {
  if (Array.isArray(value)) return "array";
  if (value === null || value === undefined) return "unknown";
  const type = typeof value;
  return type === "string" || type === "number" || type === "boolean" || type === "object"
    ? type
    : "unknown";
}

/** The ids of every step that runs before the given one. */
export function upstreamNodeIds(nodeId: string, edges: readonly VisualWorkflowRfEdge[]) {
  const upstream = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const edge of edges) {
      if (edge.target === current && !upstream.has(edge.source)) {
        upstream.add(edge.source);
        queue.push(edge.source);
      }
    }
  }
  return upstream;
}

/**
 * The fields of every step before this one: the ones each step declares, then the ones seen in
 * its last output or, before any run, in its test data.
 */
export function listUpstreamFields({
  node,
  nodes,
  edges,
  testData,
}: {
  node: VisualWorkflowRfNode;
  nodes: readonly VisualWorkflowRfNode[];
  edges: readonly VisualWorkflowRfEdge[];
  testData?: VisualWorkflowTestData;
}): UpstreamField[] {
  const upstream = upstreamNodeIds(node.id, edges);
  return nodes
    .filter((candidate) => upstream.has(candidate.id))
    .flatMap((candidate) => {
      const declared = getWorkflowOutputFields({
        id: candidate.id,
        type: candidate.data.catalogType,
        config: candidate.data.config,
        inputs: candidate.data.inputs,
        outputFields: candidate.data.outputFields,
      });
      const seen = candidate.data.lastOutput ?? testData?.[candidate.id];
      const observed = observedOutputFields(seen).filter(
        (field) => !declared.some((entry) => entry.path === field.path),
      );
      const trigger = isTriggerType(candidate.data.catalogType);
      return [
        ...declared.map((field) => ({ ...field, observed: false })),
        ...observed.map((field) => ({ ...field, observed: true })),
      ].map((field) => ({
        nodeId: candidate.id,
        trigger,
        path: field.path,
        type: field.type,
        optional: field.optional ?? false,
        observed: field.observed,
        sample: readWorkflowPath(seen, field.path.split(".")),
      }));
    });
}

/** The text that reads a field inside a step's setting. */
export function fieldReference(field: Pick<UpstreamField, "nodeId" | "trigger" | "path">) {
  return field.trigger
    ? `{{ trigger.${field.path} }}`
    : `{{ nodes.${field.nodeId}.${field.path} }}`;
}

const TEMPLATE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

export type TemplateSegment =
  | { kind: "text"; text: string }
  | {
      kind: "reference";
      raw: string;
      /** The step read, or null for the trigger or an expression the editor does not know. */
      nodeId: string | null;
      trigger: boolean;
      path: string[];
    };

/** A setting's text split into plain text and the fields it reads. */
export function splitTemplate(text: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(TEMPLATE_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ kind: "text", text: text.slice(last, start) });
    const parts = (match[1] ?? "").split(".").map((part) => part.trim());
    if (parts[0] === "trigger" && parts.length > 1) {
      segments.push({
        kind: "reference",
        raw: match[0],
        nodeId: null,
        trigger: true,
        path: parts.slice(1),
      });
    } else if (parts[0] === "nodes" && parts.length > 2) {
      segments.push({
        kind: "reference",
        raw: match[0],
        nodeId: parts[1] ?? null,
        trigger: false,
        path: parts.slice(2),
      });
    } else {
      segments.push({
        kind: "reference",
        raw: match[0],
        nodeId: null,
        trigger: false,
        path: parts,
      });
    }
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
}

/** Whether a setting's text reads any field. */
export function readsFields(text: string): boolean {
  return splitTemplate(text).some((segment) => segment.kind === "reference");
}
