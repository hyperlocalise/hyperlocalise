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
  MarkerType,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { FormattedMessage } from "react-intl";

import { Canvas } from "@/components/ai-elements/canvas";
import { Controls } from "@/components/ai-elements/controls";
import { Panel } from "@/components/ai-elements/panel";
import { Button } from "@/components/ui/button";
import { VISUAL_NODE_CATALOG } from "@/lib/visual-workflows/catalog/node-catalog";
import { validateVisualWorkflowConnection } from "@/lib/visual-workflows/validation/validate-connection";
import type {
  VisualCatalogType,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "@/lib/visual-workflows/schema/types";

import { VisualWorkflowCompactNode } from "./nodes/visual-workflow-compact-node";
import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";
import { deriveForEachLoopRegion } from "@/lib/visual-workflows/editor/for-each-body-membership";

export const VISUAL_WORKFLOW_NODE_TYPES = Object.fromEntries(
  VISUAL_NODE_CATALOG.filter((item) => item.enabled).map((item) => [
    item.type,
    VisualWorkflowCompactNode,
  ]),
) as Record<VisualCatalogType, typeof VisualWorkflowCompactNode>;

type ForEachPresentedRegion = {
  loopId: string;
  bodyNodeIds: Set<string>;
  exitNodeIds: Set<string>;
};

export function presentVisualWorkflowEdges(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
): VisualWorkflowRfEdge[] {
  const regions: ForEachPresentedRegion[] = nodes
    .filter((node) => node.data.catalogType === "logic.for_each")
    .map((node) => {
      const region = deriveForEachLoopRegion(node.id, edges);

      return {
        loopId: node.id,
        bodyNodeIds: new Set(region.bodyNodeIds),
        exitNodeIds: new Set(region.exitNodeIds),
      };
    });

  return edges.map((edge) => {
    if (edge.data?.kind === "data") {
      return {
        ...edge,
        label: `${edge.sourceHandle ?? "output"} → ${edge.targetHandle ?? "input"}`,
        style: {
          ...edge.style,
          strokeDasharray: "5 4",
        },
      };
    }

    const belongsToEachRegion = regions.some(
      (region) =>
        (edge.source === region.loopId && edge.sourceHandle === "each") ||
        (region.bodyNodeIds.has(edge.source) && region.bodyNodeIds.has(edge.target)),
    );

    if (belongsToEachRegion) {
      return {
        ...edge,
        style: {
          ...edge.style,
          stroke: "var(--primary)",
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: "var(--primary)",
        },
      };
    }

    const belongsToDoneRegion = regions.some(
      (region) =>
        (edge.source === region.loopId && edge.sourceHandle === "done") ||
        (region.exitNodeIds.has(edge.source) && region.exitNodeIds.has(edge.target)),
    );

    if (belongsToDoneRegion) {
      return {
        ...edge,
        style: {
          ...edge.style,
          stroke: "var(--muted-foreground)",
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: "var(--muted-foreground)",
        },
      };
    }

    return edge;
  });
}

export function VisualWorkflowCanvas({
  nodes,
  edges,
  isRunning,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onReconnect,
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
  onReconnect: (oldEdge: VisualWorkflowRfEdge, connection: Connection) => void;
  onSelectionChange: (params: OnSelectionChangeParams) => void;
  onAddFirstStep: () => void;
  onLoadSample: () => void;
  onTestWorkflow: () => void;
}) {
  const reconnectingEdgeIdRef = useRef<string | null>(null);
  const lastConnectionErrorRef = useRef<string | null>(null);
  const presentedEdges = useMemo(() => presentVisualWorkflowEdges(nodes, edges), [edges, nodes]);
  const isValidConnection = useCallback(
    (connection: Connection | VisualWorkflowRfEdge) => {
      const result = validateVisualWorkflowConnection({
        nodes,
        edges,
        replacingEdgeId: reconnectingEdgeIdRef.current ?? undefined,
        connection: {
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle ?? null,
          targetHandle: connection.targetHandle ?? null,
        },
      });

      lastConnectionErrorRef.current = result.valid ? null : result.message;

      return result.valid;
    },
    [edges, nodes],
  );

  return (
    <div className="relative min-h-0 min-w-0 flex-1">
      <Canvas
        className="h-full"
        nodes={nodes}
        edges={presentedEdges}
        nodeTypes={VISUAL_WORKFLOW_NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={() => {
          lastConnectionErrorRef.current = null;
        }}
        onConnectEnd={(_, connectionState) => {
          if (
            connectionState.toHandle &&
            connectionState.isValid === false &&
            lastConnectionErrorRef.current
          ) {
            toast.error(lastConnectionErrorRef.current);
          }

          lastConnectionErrorRef.current = null;
        }}
        onReconnect={onReconnect}
        onReconnectStart={(_, edge) => {
          reconnectingEdgeIdRef.current = edge.id;
          lastConnectionErrorRef.current = null;
        }}
        onReconnectEnd={(_, _edge, _handleType, connectionState) => {
          if (
            connectionState.toHandle &&
            connectionState.isValid === false &&
            lastConnectionErrorRef.current
          ) {
            toast.error(lastConnectionErrorRef.current);
          }

          reconnectingEdgeIdRef.current = null;
          lastConnectionErrorRef.current = null;
        }}
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
