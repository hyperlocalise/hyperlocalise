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
import type { Edge, Node, ReactFlowProps } from "@xyflow/react";
import { Background, ReactFlow } from "@xyflow/react";
import type { ReactNode } from "react";

import "@xyflow/react/dist/style.css";

type CanvasProps<NodeType extends Node = Node, EdgeType extends Edge = Edge> = ReactFlowProps<
  NodeType,
  EdgeType
> & {
  children?: ReactNode;
};

const deleteKeyCode = ["Backspace", "Delete"];

export function Canvas<NodeType extends Node = Node, EdgeType extends Edge = Edge>({
  children,
  ...props
}: CanvasProps<NodeType, EdgeType>) {
  return (
    <ReactFlow<NodeType, EdgeType>
      deleteKeyCode={deleteKeyCode}
      fitView
      panOnDrag={false}
      panOnScroll
      selectionOnDrag={true}
      zoomOnDoubleClick={false}
      {...props}
    >
      <Background bgColor="var(--sidebar)" />
      {children}
    </ReactFlow>
  );
}
