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
import type { CanonicalVisualWorkflowNode } from "../schema/types";
const AUTH_FIELD = /^(authorization|cookie|password|secret|token|access[_-]?token|api[_-]?key)$/i;
function containsSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecret);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, entry]) =>
      (AUTH_FIELD.test(key) && entry !== "" && entry !== null && entry !== undefined) ||
      containsSecret(entry),
  );
}
export function hasLiteralHttpCredentials(node: CanonicalVisualWorkflowNode): boolean {
  if (node.config.kind !== "action.http") return false;
  if (
    node.config.auth?.token ||
    node.config.headers?.some((header) => AUTH_FIELD.test(header.key) && Boolean(header.value))
  )
    return true;
  let body: unknown = node.config.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = undefined;
    }
  }
  if (containsSecret(body)) return true;
  return Object.entries(node.inputs ?? {}).some(
    ([name, binding]) =>
      binding.kind !== "secret" &&
      ((/^(headers|body)\./.test(name) && AUTH_FIELD.test(name.split(".").at(-1)!)) ||
        (name === "body" && binding.kind === "literal" && containsSecret(binding.value))),
  );
}
