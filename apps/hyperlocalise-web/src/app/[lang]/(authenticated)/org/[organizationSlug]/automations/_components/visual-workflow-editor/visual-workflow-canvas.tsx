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
  type ReactFlowInstance,
  type XYPosition,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
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
  VisualWorkflowCanvasEdge,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "@/lib/visual-workflows/schema/types";

import { VisualWorkflowCompactNode } from "./nodes/visual-workflow-compact-node";
import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";
import { deriveForEachLoopRegion } from "@/lib/visual-workflows/editor/for-each-body-membership";
import { listVisualWorkflowReferenceLines } from "@/lib/visual-workflows/editor/visual-workflow-reference-lines";

export const VISUAL_WORKFLOW_NODE_TYPES = Object.fromEntries(
  VISUAL_NODE_CATALOG.filter((item) => item.enabled).map((item) => [
    item.type,
    VisualWorkflowCompactNode,
  ]),
) as Record<VisualCatalogType, typeof VisualWorkflowCompactNode>;

// A label's letters get an outline in the canvas colour, which hides the line and the dots right
// behind them and nothing else. React Flow's own box behind a label is white, and shows.
const EDGE_LABEL_PROPS = {
  labelShowBg: false,
  labelStyle: {
    fill: "var(--muted-foreground)",
    paintOrder: "stroke",
    stroke: "var(--sidebar)",
    strokeWidth: 4,
    strokeLinejoin: "round",
  },
} satisfies Partial<VisualWorkflowRfEdge>;

// Execution wires are drawn thicker than data wires; a Loop's own wires were already this width.
const EXECUTION_STROKE_WIDTH = 2;

type ForEachPresentedRegion = {
  loopId: string;
  bodyNodeIds: Set<string>;
  exitNodeIds: Set<string>;
};

/**
 * The edges as the canvas draws them: execution wires thick and solid, data wires thin and solid,
 * and a thin dashed line, which cannot be selected, moved or deleted, for each field a setting's
 * text reads.
 */
export function presentVisualWorkflowEdges(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
): VisualWorkflowCanvasEdge[] {
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

  const referenceLines = listVisualWorkflowReferenceLines(nodes, edges).map(
    (line): VisualWorkflowCanvasEdge => ({
      ...line,
      data: { kind: "reference" },
      selectable: false,
      deletable: false,
      focusable: false,
      reconnectable: false,
      interactionWidth: 0,
      // React Flow's stylesheet sets pointer events on every edge and outranks Tailwind.
      className: "!pointer-events-none",
      style: { strokeDasharray: "5 4", pointerEvents: "none" },
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    }),
  );

  const presented = edges.map((edge) => {
    if (edge.data?.kind === "data") {
      // A wire drawn in this session carries the dashed style it was made with; wires are solid.
      const { strokeDasharray: _, ...style } = edge.style ?? {};
      return {
        ...edge,
        ...EDGE_LABEL_PROPS,
        style,
        label: `${edge.sourceHandle ?? "output"} → ${edge.targetHandle ?? "input"}`,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
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
          strokeWidth: EXECUTION_STROKE_WIDTH,
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
          strokeWidth: EXECUTION_STROKE_WIDTH,
        },
      };
    }

    const thick = { ...edge, style: { ...edge.style, strokeWidth: EXECUTION_STROKE_WIDTH } };
    return edge.label === undefined ? thick : { ...thick, ...EDGE_LABEL_PROPS };
  });

  return [...presented, ...referenceLines];
}

/** The edges among those the canvas draws that are stored with the workflow. */
function storedEdges(edges: readonly VisualWorkflowCanvasEdge[]): VisualWorkflowRfEdge[] {
  return edges.filter((edge): edge is VisualWorkflowRfEdge => edge.data?.kind !== "reference");
}

/** Reads the canvas position at the middle of the view, or null while the canvas is not shown. */
export type VisualWorkflowViewCenterReader = () => XYPosition | null;

/** The canvas position under the middle of the canvas's box on screen. */
export function visualWorkflowViewCenter(
  reactFlow: { screenToFlowPosition: (position: XYPosition) => XYPosition } | null,
  bounds: { left: number; top: number; width: number; height: number } | undefined,
): XYPosition | null {
  if (!reactFlow || !bounds || bounds.width === 0 || bounds.height === 0) {
    return null;
  }
  return reactFlow.screenToFlowPosition({
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  });
}

export function VisualWorkflowCanvas({
  nodes,
  edges,
  isRunning,
  onNodesChange,
  onEdgesChange,
  onBeforeDelete,
  onConnect,
  onReconnect,
  onSelectionChange,
  focusNode,
  viewCenterRef,
  onAddFirstStep,
  onLoadSample,
  onTestWorkflow,
  testSettings,
}: {
  nodes: VisualWorkflowRfNode[];
  edges: VisualWorkflowRfEdge[];
  isRunning: boolean;
  onNodesChange: (changes: NodeChange<VisualWorkflowRfNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<VisualWorkflowRfEdge>[]) => void;
  /** Runs before a keyboard deletion; returning false leaves the deletion to the editor. */
  onBeforeDelete?: (elements: {
    nodes: VisualWorkflowRfNode[];
    edges: VisualWorkflowRfEdge[];
  }) => Promise<boolean>;
  onConnect: (connection: Connection) => void;
  onReconnect: (oldEdge: VisualWorkflowRfEdge, connection: Connection) => void;
  onSelectionChange: (params: OnSelectionChangeParams) => void;
  /** The step to bring to the middle of the canvas. A new object asks again, for the same step too. */
  focusNode?: { nodeId: string } | null;
  /** Filled with a reader of the middle of the view while the canvas is shown. */
  viewCenterRef?: RefObject<VisualWorkflowViewCenterReader | null>;
  onAddFirstStep: () => void;
  onLoadSample: () => void;
  onTestWorkflow: () => void;
  /** A control shown beside the Test workflow button. */
  testSettings?: ReactNode;
}) {
  const reactFlowRef = useRef<ReactFlowInstance<
    VisualWorkflowRfNode,
    VisualWorkflowCanvasEdge
  > | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reconnectingEdgeIdRef = useRef<string | null>(null);
  const lastConnectionErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (!viewCenterRef) {
      return;
    }
    viewCenterRef.current = () =>
      visualWorkflowViewCenter(reactFlowRef.current, containerRef.current?.getBoundingClientRect());
    return () => {
      viewCenterRef.current = null;
    };
  }, [viewCenterRef]);
  const presentedEdges = useMemo(() => presentVisualWorkflowEdges(nodes, edges), [edges, nodes]);
  const referenceLineIds = useMemo(
    () =>
      new Set(
        presentedEdges.filter((edge) => edge.data?.kind === "reference").map((edge) => edge.id),
      ),
    [presentedEdges],
  );
  const isValidConnection = useCallback(
    (connection: Connection | VisualWorkflowCanvasEdge) => {
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

  useEffect(() => {
    const reactFlow = reactFlowRef.current;
    const node = focusNode ? reactFlow?.getNode(focusNode.nodeId) : undefined;
    if (!reactFlow || !node) {
      return;
    }
    void reactFlow.setCenter(
      node.position.x + (node.measured?.width ?? node.width ?? 0) / 2,
      node.position.y + (node.measured?.height ?? node.height ?? 0) / 2,
      {
        zoom: reactFlow.getZoom(),
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300,
      },
    );
  }, [focusNode]);

  return (
    <div ref={containerRef} className="relative min-h-0 min-w-0 flex-1">
      <Canvas<VisualWorkflowRfNode, VisualWorkflowCanvasEdge>
        className="h-full"
        nodes={nodes}
        edges={presentedEdges}
        nodeTypes={VISUAL_WORKFLOW_NODE_TYPES}
        onNodesChange={onNodesChange}
        // Reference lines cannot be selected or deleted; only stored edges reach the editor.
        onEdgesChange={(changes) =>
          onEdgesChange(
            changes.filter(
              (change) => !("id" in change) || !referenceLineIds.has(change.id),
            ) as EdgeChange<VisualWorkflowRfEdge>[],
          )
        }
        onBeforeDelete={
          onBeforeDelete
            ? ({ nodes: deleted, edges: deletedEdges }) =>
                onBeforeDelete({
                  nodes: deleted,
                  edges: storedEdges(deletedEdges),
                })
            : undefined
        }
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
        onReconnect={(oldEdge, connection) => {
          const [stored] = storedEdges([oldEdge]);
          if (stored) onReconnect(stored, connection);
        }}
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
        // A click on a handle would otherwise start a connection that waits for a click on another
        // handle, and the handle stays marked as its start until then.
        connectOnClick={false}
        onInit={(reactFlow) => {
          reactFlowRef.current = reactFlow;
          void reactFlow.fitView({ padding: 0.2 });
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} position="bottom-left" />
        <Panel
          position="bottom-center"
          className="flex items-center gap-2 border-0 bg-transparent p-0 shadow-none"
        >
          <Button type="button" onClick={onTestWorkflow} disabled={isRunning || nodes.length === 0}>
            {isRunning ? (
              <FormattedMessage {...messages.testingWorkflow} />
            ) : (
              <FormattedMessage {...messages.testWorkflow} />
            )}
          </Button>
          {testSettings}
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
