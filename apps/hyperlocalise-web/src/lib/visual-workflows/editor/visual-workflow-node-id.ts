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
import type { VisualCatalogType, VisualWorkflowRfNode } from "../schema/types";

/**
 * The id of a new step, readable where it shows: in a setting's text as `nodes.<id>.<path>`, in
 * the exported workflow and in run history. It is the step's kind, such as `notify_slack`, with
 * a number when the workflow already has one.
 */
export function nextVisualWorkflowNodeId(
  type: VisualCatalogType,
  nodes: readonly Pick<VisualWorkflowRfNode, "id">[],
): string {
  const base = type.slice(type.indexOf(".") + 1);
  const taken = new Set(nodes.map((node) => node.id));
  if (!taken.has(base)) return base;
  for (let count = 2; ; count += 1) {
    const candidate = `${base}_${count}`;
    if (!taken.has(candidate)) return candidate;
  }
}
