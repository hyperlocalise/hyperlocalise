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
  VisualSubworkflowField,
  VisualWorkflowV3Definition,
  VisualWorkflowValidationIssue,
} from "../schema/types";
import { WORKFLOW_LIMITS } from "../runtime/limits";

export type SubworkflowVersionResolution =
  | { status: "workflow_missing" }
  | { status: "version_missing" }
  | { status: "invalid_version" }
  | {
      status: "found";
      workflowId: string;
      version: number;
      definition: VisualWorkflowV3Definition;
    };

export type ResolveSubworkflowVersion = (input: {
  workflowId: string;
  version: number;
}) => Promise<SubworkflowVersionResolution>;

export type ReusableWorkflowContract = {
  inputs: VisualSubworkflowField[];
  outputs: VisualSubworkflowField[];
};

function sameFields(
  left: readonly VisualSubworkflowField[],
  right: readonly VisualSubworkflowField[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((field, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      field.id === other.id &&
      field.name === other.name &&
      field.type === other.type &&
      (field.required !== false) === (other.required !== false)
    );
  });
}

export function deriveReusableWorkflowContract(
  definition: VisualWorkflowV3Definition,
): ReusableWorkflowContract | null {
  const trigger = definition.nodes.find((node) => node.type === "trigger.manual");
  if (!trigger) return null;

  const inputs = (trigger.outputFields ?? []).map((field) => ({
    id: field.path,
    name: field.path,
    type: field.type,
    required: field.optional !== true,
  }));
  const returns = definition.nodes.filter(
    (node) => node.type === "flow.return" && node.config.kind === "flow.return",
  );
  if (returns.length === 0) return null;
  const returnOutputs = returns[0]?.config.kind === "flow.return" ? returns[0].config.outputs : [];
  const outputs = returnOutputs.map((field) => ({ ...field, required: true }));

  for (const returnNode of returns.slice(1)) {
    if (
      returnNode.config.kind !== "flow.return" ||
      !sameFields(returnOutputs, returnNode.config.outputs)
    ) {
      return null;
    }
  }

  return { inputs, outputs };
}

export async function validateSubworkflowCalls(input: {
  definition: VisualWorkflowV3Definition;
  workflowId: string;
  resolveVersion: ResolveSubworkflowVersion;
  maxDepth?: number;
}): Promise<VisualWorkflowValidationIssue[]> {
  const issues: VisualWorkflowValidationIssue[] = [];
  const maxDepth = input.maxDepth ?? WORKFLOW_LIMITS.subworkflowDepth;
  const cache = new Map<string, SubworkflowVersionResolution>();
  const resolve = async (workflowId: string, version: number) => {
    const key = `${workflowId}:${version}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const result = await input.resolveVersion({ workflowId, version });
    cache.set(key, result);
    return result;
  };

  const visit = async (
    definition: VisualWorkflowV3Definition,
    workflowStack: readonly string[],
  ): Promise<void> => {
    for (const node of definition.nodes) {
      if (node.config.kind !== "flow.call_workflow") continue;

      const resolved = await resolve(node.config.workflowId, node.config.version);
      if (resolved.status === "workflow_missing") {
        issues.push({ code: "subworkflow_not_found", nodeId: node.id });
        continue;
      }
      if (resolved.status === "version_missing") {
        issues.push({ code: "subworkflow_version_not_found", nodeId: node.id });
        continue;
      }
      if (resolved.status === "invalid_version") {
        issues.push({ code: "subworkflow_contract_mismatch", nodeId: node.id });
        continue;
      }

      const contract = deriveReusableWorkflowContract(resolved.definition);
      if (
        !contract ||
        !sameFields(node.config.inputFields, contract.inputs) ||
        !sameFields(node.config.outputFields, contract.outputs)
      ) {
        issues.push({ code: "subworkflow_contract_mismatch", nodeId: node.id });
      }

      if (workflowStack.includes(resolved.workflowId)) {
        issues.push({ code: "recursive_subworkflow", nodeId: node.id });
        continue;
      }
      if (workflowStack.length >= maxDepth) {
        issues.push({ code: "subworkflow_depth_exceeded", nodeId: node.id });
        continue;
      }

      await visit(resolved.definition, [...workflowStack, resolved.workflowId]);
    }
  };

  await visit(input.definition, [input.workflowId]);
  return issues;
}
