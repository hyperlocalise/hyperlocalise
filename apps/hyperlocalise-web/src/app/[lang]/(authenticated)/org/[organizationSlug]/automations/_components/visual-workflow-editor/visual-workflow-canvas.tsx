"use client";

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
import {
  addEdge,
  MarkerType,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import { useCallback } from "react";
import { FormattedMessage } from "react-intl";

import { Canvas } from "@/components/ai-elements/canvas";
import { Controls } from "@/components/ai-elements/controls";
import { Panel } from "@/components/ai-elements/panel";
import { Button } from "@/components/ui/button";
import { isTriggerType, VISUAL_NODE_CATALOG } from "@/lib/visual-workflows/catalog/node-catalog";
import type {
  VisualCatalogType,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "@/lib/visual-workflows/schema/types";

import { VisualWorkflowCompactNode } from "./nodes/visual-workflow-compact-node";
import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";

export const VISUAL_WORKFLOW_NODE_TYPES = Object.fromEntries(
  VISUAL_NODE_CATALOG.filter((item) => item.enabled).map((item) => [
    item.type,
    VisualWorkflowCompactNode,
  ]),
) as Record<VisualCatalogType, typeof VisualWorkflowCompactNode>;

export function VisualWorkflowCanvas({
  nodes,
  edges,
  isRunning,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectionChange,
  onAddFirstStep,
  onLoadSample,
  onTestWorkflow,
}: {
  nodes: VisualWorkflowRfNode[];
  edges: VisualWorkflowRfEdge[];
  isRunning: boolean;
  onNodesChange: (changes: NodeChange<VisualWorkflowRfNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<VisualWorkflowRfEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  onSelectionChange: (params: OnSelectionChangeParams) => void;
  onAddFirstStep: () => void;
  onLoadSample: () => void;
  onTestWorkflow: () => void;
}) {
  const isValidConnection = useCallback(
    (connection: Connection | VisualWorkflowRfEdge) => {
      if (!connection.target || connection.source === connection.target) {
        return false;
      }
      const target = nodes.find((node) => node.id === connection.target);
      if (!target) {
        return false;
      }
      return !isTriggerType(target.data.catalogType);
    },
    [nodes],
  );

  return (
    <div className="relative min-h-0 min-w-0 flex-1">
      <Canvas
        className="h-full"
        nodes={nodes}
        edges={edges}
        nodeTypes={VISUAL_WORKFLOW_NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        isValidConnection={isValidConnection}
        panOnDrag
        selectionOnDrag={false}
        fitView
        defaultEdgeOptions={{
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        }}
        onInit={(reactFlow) => {
          void reactFlow.fitView({ padding: 0.2 });
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} position="bottom-left" />
        <Panel position="bottom-center" className="border-0 bg-transparent p-0 shadow-none">
          <Button type="button" onClick={onTestWorkflow} disabled={isRunning || nodes.length === 0}>
            {isRunning ? (
              <FormattedMessage {...messages.testingWorkflow} />
            ) : (
              <FormattedMessage {...messages.testWorkflow} />
            )}
          </Button>
        </Panel>
      </Canvas>
      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2">
          <Button type="button" className="pointer-events-auto" onClick={onAddFirstStep}>
            <FormattedMessage {...messages.addFirstStep} />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="pointer-events-auto"
            onClick={onLoadSample}
          >
            <FormattedMessage {...messages.loadSample} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function applyVisualWorkflowConnection(
  edges: VisualWorkflowRfEdge[],
  connection: Connection,
): VisualWorkflowRfEdge[] {
  const sourceHandle = connection.sourceHandle ?? undefined;
  return addEdge(
    {
      ...connection,
      label: sourceHandle ?? undefined,
    },
    edges,
  );
}
