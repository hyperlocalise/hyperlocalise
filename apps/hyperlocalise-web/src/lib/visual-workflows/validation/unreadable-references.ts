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
import { getWorkflowInputFields } from "../catalog/node-contracts";
import type {
  CanonicalVisualWorkflowNode,
  VisualWorkflowDefinition,
  VisualWorkflowValidationIssue,
} from "../schema/types";

const TEMPLATE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;
const WHOLE_TEMPLATE_PATTERN = /^\{\{\s*([^}]+?)\s*\}\}$/;

/** A `{{ }}` reference in a step's setting that no run can read. */
export type UnreadableWorkflowReference = {
  /** The setting that holds it, by its key. */
  field: string;
  /** The reference as written, such as `{{ item.projectId }}`. */
  reference: string;
};

/**
 * Every `{{ }}` reference in a step's settings that starts with neither `trigger.` nor `nodes.`,
 * in the settings a run fills in. A run reads no other reference (`resolveExpressionPath` in
 * `runtime/expressions.ts`), so the step stops there: a Loop's current item is
 * `{{ nodes.<loop id>.item.<field> }}`, never `{{ item.<field> }}`.
 *
 * Only the settings a run fills in are looked at, since `{{ }}` elsewhere is kept as written or
 * means something else, as a Text template's own placeholders do. Keep in step with
 * `resolveWorkflowNodeInputs` in `runtime/bindings.ts`, and with the Switch and Set steps in
 * `runtime/execute-logic-node.ts`.
 */
export function listUnreadableWorkflowReferences(
  node: CanonicalVisualWorkflowNode,
  /** Settings fed by a wire, for a canvas whose wires are not yet stored as the step's inputs. */
  wired: readonly string[] = [],
): UnreadableWorkflowReference[] {
  const config = node.config as unknown as Record<string, unknown>;
  const fed = new Set([...Object.keys(node.inputs ?? {}), ...wired]);
  const found: UnreadableWorkflowReference[] = [];
  const scan = (field: string, text: unknown) => {
    if (typeof text !== "string") return;
    for (const match of text.matchAll(TEMPLATE_PATTERN)) {
      const path = (match[1] ?? "").trim();
      if (path.startsWith("trigger.") || path.startsWith("nodes.")) continue;
      if (!found.some((entry) => entry.field === field && entry.reference === match[0])) {
        found.push({ field, reference: match[0] });
      }
    }
  };
  const scanJson = (field: string, value: unknown) => {
    if (typeof value === "string") scan(field, value);
    else if (Array.isArray(value)) for (const entry of value) scanJson(field, entry);
    else if (value && typeof value === "object") {
      for (const entry of Object.values(value)) scanJson(field, entry);
    }
  };

  for (const { name } of getWorkflowInputFields(node)) {
    // An HTTP body is filled in below, by its own rules.
    if (fed.has(name) || name === "body") continue;
    const value = config[name];
    if (name === "collection") {
      // A list is one whole reference, or JSON whose text is kept as written.
      if (typeof value === "string" && WHOLE_TEMPLATE_PATTERN.test(value.trim())) {
        scan(name, value);
      }
    } else {
      scan(name, value);
    }
  }

  if (node.config.kind === "logic.switch") {
    for (const entry of node.config.cases) scan("cases", entry.value);
  }
  if (node.config.kind === "logic.set") {
    for (const assignment of node.config.assignments) {
      const key = assignment.key.trim();
      if (key && !fed.has(key)) scan("assignments", assignment.value);
    }
  }
  if (node.config.kind === "action.http") {
    const { headers, queryParams, body, method, bodyType } = node.config;
    for (const pair of headers ?? []) {
      const wiredHeader = [...fed].some(
        (name) => name.toLowerCase() === `headers.${pair.key.toLowerCase()}`,
      );
      if (!wiredHeader) scan("headers", pair.value);
    }
    for (const pair of queryParams ?? []) scan("queryParams", pair.value);
    const bodyFed = [...fed].some((name) => name === "body" || name.startsWith("body."));
    if (!bodyFed && method !== "GET" && body !== undefined) {
      if (bodyType === "text") scan("body", body);
      if (bodyType === "json") {
        try {
          scanJson("body", typeof body === "string" ? JSON.parse(body) : body);
        } catch {
          // Text that is not JSON stops the run for that reason, which is not this check's.
        }
      }
    }
  }
  return found;
}

/**
 * One issue per setting that holds such a reference, for the editor and for publishing. A run
 * does not check this before it starts: a workflow published earlier keeps running as it did,
 * and stops at the step only when the step runs.
 */
export function listUnreadableReferenceIssues(
  definition: Pick<VisualWorkflowDefinition, "nodes">,
): VisualWorkflowValidationIssue[] {
  return definition.nodes.flatMap((node) =>
    [...new Set(listUnreadableWorkflowReferences(node).map((entry) => entry.field))].map(
      (field): VisualWorkflowValidationIssue => ({
        code: "invalid_binding",
        nodeId: node.id,
        field,
        reason: "unreadable_reference",
      }),
    ),
  );
}
