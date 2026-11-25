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

/** How a new step is attached to the graph when it is created. */
export type VisualWorkflowAddIntent = {
  from?: {
    nodeId: string;
    handleId?: string | null;
    handleType?: "source" | "target";
  };
  /** Canvas coordinates for the new step; used when dropped from a pin or the pane. */
  position?: { x: number; y: number };
  /** Insert the new step on this wire, reconnecting both ends. */
  spliceEdgeId?: string;
};
