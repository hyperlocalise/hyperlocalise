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
  CanonicalVisualWorkflowNode,
  VisualKeyValuePair,
  WorkflowBinding,
} from "../schema/types";
import { NODE_CONTRACTS, matchesWorkflowType } from "../catalog/node-contracts";
import type { VisualWorkflowExecutionContext } from "./context";
import { resolveVisualWorkflowCollection, resolveVisualWorkflowTemplate } from "./expressions";
import { resolveHttpRequestBody } from "./http-request";

export function readWorkflowPath(root: unknown, path: readonly (string | number)[]): unknown {
  let value = root;
  for (const key of path) {
    if (
      ["__proto__", "prototype", "constructor"].includes(String(key)) ||
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, key)
    )
      return undefined;
    value = (value as Record<string | number, unknown>)[key];
  }
  return value;
}
export function resolveWorkflowBinding(
  binding: WorkflowBinding,
  context: VisualWorkflowExecutionContext,
): unknown {
  let value: unknown;
  switch (binding.kind) {
    case "literal":
      value = binding.value;
      break;
    case "reference":
      value = readWorkflowPath(
        binding.nodeId === "$trigger" ? context.trigger : context.nodes[binding.nodeId],
        binding.path,
      );
      break;
    case "template":
      value = resolveVisualWorkflowTemplate(binding.template, context);
      break;
    case "secret":
      throw new Error("secret_requires_server_resolution");
  }
  if (value === undefined && Object.hasOwn(binding, "fallback")) return binding.fallback;
  if (value === undefined && !binding.optional) throw new Error("missing_workflow_input");
  return value;
}
export function resolveWorkflowNodeInputs(
  node: CanonicalVisualWorkflowNode,
  context: VisualWorkflowExecutionContext,
): CanonicalVisualWorkflowNode {
  const config = { ...node.config } as Record<string, unknown>;
  const bound = node.inputs ?? {};
  for (const [name, binding] of Object.entries(bound)) {
    const value =
      binding.kind === "secret"
        ? "[credential reference]"
        : resolveWorkflowBinding(binding, context);
    const field = NODE_CONTRACTS[node.type].inputs.find((field) => field.name === name);
    if (
      !field &&
      node.type !== "logic.set" &&
      !(node.type === "action.http" && /^(headers|body)\./.test(name))
    )
      throw new Error("unknown_workflow_input");
    if (value === undefined) {
      if (field?.required) throw new Error("missing_workflow_input");
      delete config[name];
      continue;
    }
    if (field && !matchesWorkflowType(value, field.type))
      throw new Error("workflow_input_type_mismatch");
    setResolvedInput(config, name, value);
  }
  for (const field of NODE_CONTRACTS[node.type].inputs) {
    let value = config[field.name];
    if (!bound[field.name]) {
      if (field.name === "collection") value = resolveVisualWorkflowCollection(value, context);
      // HTTP bodies are expanded in resolveUnboundHttpActionTemplates so JSON
      // string leaves are templated before stringify (avoids quote-breaking).
      else if (typeof value === "string" && field.name !== "body")
        value = resolveVisualWorkflowTemplate(value, context);
    }
    if (
      field.required &&
      (value === undefined || (!bound[field.name] && (value === null || value === "")))
    )
      throw new Error("missing_workflow_input");
    if (value !== undefined && !matchesWorkflowType(value, field.type))
      throw new Error("workflow_input_type_mismatch");
    config[field.name] = value;
  }
  if (node.type === "action.http") {
    resolveUnboundHttpActionTemplates(config, bound, context);
  }
  return { ...node, config: config as CanonicalVisualWorkflowNode["config"] };
}

/**
 * Production/durable runs call execute with `inputsResolved: true` so injected
 * secrets are not re-templated. Unbound `{{trigger.*}}` / `{{nodes.*}}` in HTTP
 * body, headers, query params, and auth tokens must therefore be expanded here.
 */
function resolveUnboundHttpActionTemplates(
  config: Record<string, unknown>,
  bound: Record<string, WorkflowBinding>,
  context: VisualWorkflowExecutionContext,
) {
  const boundHeaderKeys = new Set(
    Object.keys(bound)
      .filter((name) => name.startsWith("headers."))
      .map((name) => name.slice("headers.".length).toLowerCase()),
  );
  if (Array.isArray(config.headers)) {
    config.headers = (config.headers as VisualKeyValuePair[]).map((pair) =>
      boundHeaderKeys.has(pair.key.toLowerCase())
        ? pair
        : { ...pair, value: resolveVisualWorkflowTemplate(pair.value, context) },
    );
  }
  if (Array.isArray(config.queryParams)) {
    config.queryParams = (config.queryParams as VisualKeyValuePair[]).map((pair) => ({
      ...pair,
      value: resolveVisualWorkflowTemplate(pair.value, context),
    }));
  }

  const bodyBound =
    Boolean(bound.body) || Object.keys(bound).some((name) => name.startsWith("body."));
  if (!bodyBound && config.body !== undefined) {
    const method = typeof config.method === "string" ? config.method : "POST";
    const bodyType =
      config.bodyType === "json" || config.bodyType === "text" || config.bodyType === "none"
        ? config.bodyType
        : "none";
    const resolvedBody = resolveHttpRequestBody({
      body: config.body,
      bodyType,
      context,
      method,
      resolved: false,
    });
    if (resolvedBody !== undefined) config.body = resolvedBody;
  }

  const auth = config.auth as
    | { type?: string; token?: string; credentialId?: string; headerName?: string }
    | undefined;
  if (auth?.token && !auth.credentialId) {
    config.auth = {
      ...auth,
      token: resolveVisualWorkflowTemplate(auth.token, context),
    };
  }
}
export function setResolvedInput(config: Record<string, unknown>, name: string, value: unknown) {
  if (name.startsWith("headers.")) {
    if (typeof value !== "string") throw new Error("workflow_header_requires_string");
    const key = name.slice(8);
    const headers = Array.isArray(config.headers)
      ? (config.headers as { key: string; value: string }[])
      : [];
    config.headers = [
      ...headers.filter((header) => header.key.toLowerCase() !== key.toLowerCase()),
      { key, value: String(value) },
    ];
    return;
  }
  if (name.startsWith("body.")) {
    let body = config.body;
    if (typeof body === "string") body = JSON.parse(body);
    if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
    const result = structuredClone(body) as Record<string, unknown>;
    const path = name.slice(5).split(".");
    let current = result;
    for (const part of path)
      if (["__proto__", "constructor", "prototype"].includes(part))
        throw new Error("invalid_input_path");
    for (const part of path.slice(0, -1)) {
      if (!current[part] || typeof current[part] !== "object") current[part] = {};
      current = current[part] as Record<string, unknown>;
    }
    current[path.at(-1)!] = value;
    config.body = result;
    return;
  }
  config[name] = value;
}
