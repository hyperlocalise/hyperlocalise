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
import { VISUAL_NODE_CATALOG } from "../catalog/node-catalog";
import type { VisualCatalogType } from "../schema/types";

/** Drag payload when a catalog row is dragged onto the canvas. */
export const VISUAL_WORKFLOW_NODE_DRAG_MIME = "application/x-hyperlocalise-visual-workflow-node";

const CATALOG_TYPES = new Set<string>(VISUAL_NODE_CATALOG.map((item) => item.type));

export function visualWorkflowNodeTypeFromDrag(
  dataTransfer: DataTransfer,
): VisualCatalogType | null {
  const raw =
    dataTransfer.getData(VISUAL_WORKFLOW_NODE_DRAG_MIME) || dataTransfer.getData("text/plain");
  return CATALOG_TYPES.has(raw) ? (raw as VisualCatalogType) : null;
}
