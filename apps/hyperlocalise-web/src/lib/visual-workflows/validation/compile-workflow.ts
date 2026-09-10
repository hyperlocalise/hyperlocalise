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
import { hasLiteralHttpCredentials } from "./credential-policy";
import type {
  VisualWorkflowDefinition,
  VisualWorkflowValidationIssue,
  WorkflowBinding,
  CanonicalVisualWorkflowNode,
} from "../schema/types";
import { isTriggerType } from "../catalog/node-catalog";
import {
  NODE_CONTRACTS,
  matchesWorkflowType,
  getWorkflowOutputFields,
} from "../catalog/node-contracts";
export function workflowAncestors(
  definition: Pick<VisualWorkflowDefinition, "edges">,
  id: string,
): Set<string> {
  const result = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of definition.edges.filter((edge) => edge.target === current))
      if (!result.has(edge.source)) {
        result.add(edge.source);
        queue.push(edge.source);
      }
  }
  return result;
}
export function compileWorkflowIssues(
  definition: VisualWorkflowDefinition,
): VisualWorkflowValidationIssue[] {
  const issues: VisualWorkflowValidationIssue[] = [];
  const nodes = new Map(definition.nodes.map((node) => [node.id, node]));
  const add = (code: VisualWorkflowValidationIssue["code"], nodeId?: string, edgeId?: string) =>
    issues.push({ code, nodeId, edgeId });
  if (
    nodes.size !== definition.nodes.length ||
    new Set(definition.edges.map((edge) => edge.id)).size !== definition.edges.length
  )
    add("duplicate_id");
  const incoming = new Map(definition.nodes.map((node) => [node.id, 0]));
  for (const edge of definition.edges) {
    const source = nodes.get(edge.source),
      target = nodes.get(edge.target);
    if (!source || !target) continue;
    incoming.set(target.id, incoming.get(target.id)! + 1);
    const allowed: (string | null)[] =
      source.type === "logic.if"
        ? ["true", "false"]
        : source.config.kind === "logic.switch"
          ? ["default", ...source.config.cases.map((_, index) => String(index))]
          : source.type === "logic.for_each"
            ? ["each", "done"]
            : [
                null,
                "success",
                ...("onError" in source.config && source.config.onError === "branch"
                  ? ["error"]
                  : []),
              ];
    if (
      !allowed.includes(edge.sourceHandle) ||
      ![null, "input"].includes(edge.targetHandle) ||
      isTriggerType(target.type)
    )
      add("invalid_handle", undefined, edge.id);
  }
  const queue = [...incoming].filter(([, count]) => count === 0).map(([id]) => id);
  const ordered: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const edge of definition.edges.filter((edge) => edge.source === id)) {
      if (!incoming.has(edge.target)) continue;
      const count = incoming.get(edge.target)! - 1;
      incoming.set(edge.target, count);
      if (count === 0) queue.push(edge.target);
    }
  }
  if (ordered.length !== nodes.size) add("cycle");
  const dominators = new Map<string, Set<string>>();
  for (const id of ordered) {
    const predecessors = definition.edges
      .filter((edge) => edge.target === id)
      .map((edge) => edge.source);
    const common = new Set(predecessors.length ? (dominators.get(predecessors[0]!) ?? []) : []);
    for (const predecessor of predecessors.slice(1))
      for (const ancestor of common)
        if (!dominators.get(predecessor)?.has(ancestor)) common.delete(ancestor);
    common.add(id);
    dominators.set(id, common);
  }
  const owners = new Map<string, string>();
  for (const node of definition.nodes.filter((node) => node.type === "logic.for_each")) {
    const body = new Set(node.bodyNodeIds ?? []);
    if (!body.size || body.has(node.id) || body.size !== (node.bodyNodeIds ?? []).length)
      add("invalid_loop", node.id);
    for (const id of body) {
      if (!nodes.has(id) || owners.has(id) || !workflowAncestors(definition, id).has(node.id))
        add("invalid_loop", id);
      owners.set(id, node.id);
      if (nodes.get(id)?.type === "logic.for_each") add("nested_for_each", id);
    }
    for (const edge of definition.edges) {
      if (edge.source === node.id && (edge.sourceHandle === "each") !== body.has(edge.target))
        add("invalid_loop", undefined, edge.id);
      if (body.has(edge.target) && !body.has(edge.source) && edge.source !== node.id)
        add("invalid_loop", undefined, edge.id);
      if (body.has(edge.source) && !body.has(edge.target)) add("invalid_loop", undefined, edge.id);
    }
    if (!definition.edges.some((edge) => edge.source === node.id && edge.sourceHandle === "each"))
      add("invalid_loop", node.id);
  }
  const checkReference = (
    node: CanonicalVisualWorkflowNode,
    binding: Extract<WorkflowBinding, { kind: "reference" }>,
    collect = false,
  ): boolean => {
    if (
      binding.path.some((segment) =>
        ["__proto__", "constructor", "prototype"].includes(String(segment)),
      )
    )
      return false;
    if (binding.nodeId === "$trigger") return true;
    const source = nodes.get(binding.nodeId);
    if (!source) return false;
    const allowed = collect
      ? new Set(node.bodyNodeIds ?? [])
      : workflowAncestors(definition, node.id);
    if (!allowed.has(source.id)) return false;
    const owner = owners.get(source.id);
    if (owner && !(collect && owner === node.id) && owner !== owners.get(node.id)) return false;
    if (
      source.type === "logic.for_each" &&
      ["item", "index"].includes(String(binding.path[0])) &&
      owners.get(node.id) !== source.id
    )
      return false;
    const fields = getWorkflowOutputFields(source);
    const path = binding.path.join(".");
    const field = fields.find((field) => field.path === path);
    const dynamic =
      source.type.startsWith("trigger.") ||
      source.type === "logic.set" ||
      fields.some(
        (field) =>
          ["unknown", "object", "array"].includes(field.type) && path.startsWith(field.path + "."),
      );
    if (!field && !dynamic && binding.path.length) return false;
    const conditional = !collect && !dominators.get(node.id)?.has(source.id);
    return (
      !(field?.optional || conditional) ||
      Boolean(binding.optional) ||
      Object.hasOwn(binding, "fallback")
    );
  };
  for (const node of definition.nodes) {
    const config = node.config as unknown as Record<string, unknown>;
    const checkTemplates = (value: unknown): void => {
      if (typeof value === "string") {
        for (const match of value.matchAll(/\{\{\s*nodes\.([^}.]+)\.([^}]+?)\s*\}\}/g))
          if (
            !checkReference(node, {
              kind: "reference",
              nodeId: match[1]!,
              path: match[2]!.trim().split("."),
            })
          )
            add("invalid_binding", node.id);
      } else if (Array.isArray(value)) value.forEach(checkTemplates);
      else if (value && typeof value === "object") Object.values(value).forEach(checkTemplates);
    };
    for (const [name, value] of Object.entries(config))
      if (!node.inputs?.[name]) checkTemplates(value);
    for (const field of NODE_CONTRACTS[node.type].inputs)
      if (
        field.required &&
        !node.inputs?.[field.name] &&
        (config[field.name] === undefined ||
          config[field.name] === null ||
          config[field.name] === "")
      )
        add("invalid_node_config", node.id);
    for (const field of node.outputFields ?? [])
      if (
        field.path.split(".").some((key) => ["__proto__", "constructor", "prototype"].includes(key))
      )
        add("invalid_node_config", node.id);
    for (const [name, binding] of Object.entries(node.inputs ?? {})) {
      const field = NODE_CONTRACTS[node.type].inputs.find((field) => field.name === name);
      let invalid =
        !field &&
        node.type !== "logic.set" &&
        !(node.type === "action.http" && /^(headers|body)\./.test(name));
      if (
        /^(headers\.(authorization|x-api-key|cookie)|body\..*(token|password|secret))$/i.test(
          name,
        ) &&
        binding.kind !== "secret"
      )
        invalid = true;
      if (binding.kind === "literal" && field && !matchesWorkflowType(binding.value, field.type))
        invalid = true;
      if (binding.kind === "reference") {
        if (!checkReference(node, binding)) invalid = true;
        const source = nodes.get(binding.nodeId);
        const output = source
          ? getWorkflowOutputFields(source).find((field) => field.path === binding.path.join("."))
          : undefined;
        if (
          output &&
          field &&
          output.type !== "unknown" &&
          field.type !== "unknown" &&
          output.type !== field.type
        )
          invalid = true;
      }
      if (
        binding.kind === "secret" &&
        !(node.type === "action.http" && /^(headers|body)\./.test(name))
      )
        invalid = true;
      if (binding.kind === "template")
        for (const match of binding.template.matchAll(/\{\{\s*nodes\.([^}.]+)\.([^}]+?)\s*\}\}/g))
          if (
            !checkReference(node, {
              kind: "reference",
              nodeId: match[1]!,
              path: match[2]!.trim().split("."),
            })
          )
            invalid = true;
      if (invalid) add("invalid_binding", node.id);
    }
    for (const binding of Object.values(node.collect ?? {}))
      if (
        binding.kind === "secret" ||
        (binding.kind === "reference" && !checkReference(node, binding, true))
      )
        add("invalid_binding", node.id);
    if (node.type !== "logic.for_each" && (node.bodyNodeIds || node.collect))
      add("invalid_loop", node.id);
    if (hasLiteralHttpCredentials(node)) add("invalid_node_config", node.id);
  }
  return issues;
}
