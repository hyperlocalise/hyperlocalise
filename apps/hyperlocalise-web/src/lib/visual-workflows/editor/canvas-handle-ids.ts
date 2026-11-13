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
import type { Edge } from "@xyflow/react";

// On the canvas a data port's handle id carries a prefix, so it never equals the id of an
// execution handle on the same step (a step's `error` output and its error branch, say). React
// Flow finds where a wire starts by handle id alone. Saved edges keep the plain port ids.
const DATA_HANDLE_PREFIX = "data:";

/** The canvas handle id of a data port. */
export function canvasDataHandleId(portId: string): string {
  return `${DATA_HANDLE_PREFIX}${portId}`;
}

function portIdFromCanvasHandle<T extends string | null | undefined>(handleId: T): T {
  return (
    handleId?.startsWith(DATA_HANDLE_PREFIX) ? handleId.slice(DATA_HANDLE_PREFIX.length) : handleId
  ) as T;
}

/**
 * The port a connection's handle names, and whether the canvas drew it as a data port. A handle
 * from anywhere but the canvas (the assistant, saved edges) is never marked as data.
 */
export function readConnectionHandle(handleId: string | null | undefined): {
  portId: string | null;
  isData: boolean;
} {
  return {
    portId: portIdFromCanvasHandle(handleId) ?? null,
    isData: handleId?.startsWith(DATA_HANDLE_PREFIX) ?? false,
  };
}

/** A saved data or reference edge as the canvas draws it, attached to the data ports' handles. */
export function toCanvasEdgeHandles<E extends Edge<{ kind?: string }>>(edge: E): E {
  if (edge.data?.kind !== "data" && edge.data?.kind !== "reference") {
    return edge;
  }
  return {
    ...edge,
    sourceHandle: edge.sourceHandle ? canvasDataHandleId(edge.sourceHandle) : edge.sourceHandle,
    targetHandle: edge.targetHandle ? canvasDataHandleId(edge.targetHandle) : edge.targetHandle,
  };
}

/** A canvas edge with the port ids it is saved with. */
export function fromCanvasEdgeHandles<E extends Edge<{ kind?: string }>>(edge: E): E {
  if (edge.data?.kind !== "data" && edge.data?.kind !== "reference") {
    return edge;
  }
  return {
    ...edge,
    sourceHandle: portIdFromCanvasHandle(edge.sourceHandle),
    targetHandle: portIdFromCanvasHandle(edge.targetHandle),
  };
}
