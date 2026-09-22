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
import type { VisualCatalogType, VisualNodeConfig } from "../schema/types";

export type VisualWorkflowHandleSource = {
  type: VisualCatalogType;
  config: VisualNodeConfig;
};

export function getAllowedExecutionSourceHandles(
  node: VisualWorkflowHandleSource,
): Array<string | null> {
  if (node.type === "logic.if") {
    return ["true", "false"];
  }
  if (node.config.kind === "logic.switch") {
    return ["default", ...node.config.cases.map((entry) => entry.id)];
  }
  if (node.type === "logic.for_each") {
    return ["each", "done"];
  }
  if (node.type === "logic.retry") {
    return ["attempt", "succeeded", "exhausted"];
  }
  return [
    null,
    "success",
    ...("onError" in node.config && node.config.onError === "branch" ? (["error"] as const) : []),
  ];
}

export function getPrimaryExecutionSourceHandle(node: VisualWorkflowHandleSource): string | null {
  if (node.type === "logic.if") {
    return "true";
  }
  if (node.config.kind === "logic.switch") {
    return node.config.cases[0]?.id ?? "default";
  }
  if (node.type === "logic.for_each") {
    return "each";
  }
  if (node.type === "logic.retry") {
    return "attempt";
  }
  return null;
}

export function coerceExecutionSourceHandle(rawHandle?: string | null): string | null {
  return rawHandle === undefined || rawHandle === "" ? null : rawHandle;
}

export function normalizeExecutionSourceHandle(
  node: VisualWorkflowHandleSource,
  rawHandle?: string | null,
): { ok: true; handle: string | null } | { ok: false } {
  const handle = coerceExecutionSourceHandle(rawHandle);
  if (!getAllowedExecutionSourceHandles(node).includes(handle)) {
    return { ok: false };
  }
  return { ok: true, handle };
}
