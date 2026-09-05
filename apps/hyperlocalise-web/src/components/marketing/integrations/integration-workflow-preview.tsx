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
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  MarkerType,
  useEdgesState,
  useNodesState,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import { PauseIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage } from "react-intl";

import { Canvas } from "@/components/ai-elements/canvas";
import { Controls } from "@/components/ai-elements/controls";
import { visualWorkflowEditorMessages as editorMessages } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/visual-workflow-editor/visual-workflow-editor.messages";
import { VisualWorkflowCanvasActionsProvider } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/visual-workflow-editor/visual-workflow-canvas-actions";
import { VISUAL_WORKFLOW_NODE_TYPES } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/visual-workflow-editor/visual-workflow-canvas";
import type { ResolvedIntegrationWorkflow } from "@/lib/integrations/integration-catalog.types";
import {
  buildWorkflowEdges,
  buildWorkflowNodes,
  styleWorkflowEdges,
} from "@/lib/integrations/integration-workflow-graph";
import type { VisualWorkflowRfNode } from "@/lib/visual-workflows/schema/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TypographyMuted } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

type IntegrationWorkflowPreviewCopy = {
  triggerLabel: string;
  actionLabel: string;
  previewHint: string;
  playLabel: string;
  pauseLabel: string;
};

type IntegrationWorkflowPreviewProps = {
  workflows: ResolvedIntegrationWorkflow[];
  integrationSlug: string;
  integrationNamesBySlug: Readonly<Record<string, string>>;
  copy: IntegrationWorkflowPreviewCopy;
};

function buildFlowState(
  workflow: ResolvedIntegrationWorkflow,
  workflowKey: string,
  integrationSlug: string,
  integrationNamesBySlug: Readonly<Record<string, string>>,
  activeIndex: number,
) {
  const nodes = buildWorkflowNodes(
    workflow,
    workflowKey,
    integrationSlug,
    integrationNamesBySlug,
    activeIndex,
  );
  const edges = styleWorkflowEdges(
    buildWorkflowEdges(workflowKey, workflow.steps.length),
    activeIndex,
  );

  return { nodes, edges };
}

export function IntegrationWorkflowPreview({
  workflows,
  integrationSlug,
  integrationNamesBySlug,
  copy,
}: IntegrationWorkflowPreviewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const selectedWorkflow = workflows[selectedIndex] ?? workflows[0];
  const workflowKey = `workflow-${selectedIndex}`;

  const initialFlow = useMemo(
    () =>
      selectedWorkflow
        ? buildFlowState(
            selectedWorkflow,
            workflowKey,
            integrationSlug,
            integrationNamesBySlug,
            activeIndex,
          )
        : { nodes: [], edges: [] },
    [activeIndex, integrationNamesBySlug, integrationSlug, selectedWorkflow, workflowKey],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialFlow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialFlow.edges);

  const resetFlow = useCallback(
    (
      nextWorkflow: ResolvedIntegrationWorkflow,
      nextWorkflowKey: string,
      nextActiveIndex: number,
    ) => {
      const nextFlow = buildFlowState(
        nextWorkflow,
        nextWorkflowKey,
        integrationSlug,
        integrationNamesBySlug,
        nextActiveIndex,
      );
      setNodes(nextFlow.nodes);
      setEdges(nextFlow.edges);
    },
    [integrationNamesBySlug, integrationSlug, setEdges, setNodes],
  );

  useEffect(() => {
    if (!selectedWorkflow) {
      return;
    }

    setActiveIndex(0);
    setIsPlaying(true);
    resetFlow(selectedWorkflow, workflowKey, 0);
  }, [resetFlow, selectedWorkflow, workflowKey]);

  useEffect(() => {
    setNodes((current) =>
      current.map((node, index) => ({
        ...node,
        data: {
          ...node.data,
          runStatus: index < activeIndex ? "succeeded" : index === activeIndex ? "running" : "idle",
        },
      })),
    );
    setEdges((current) => styleWorkflowEdges(current, activeIndex));
  }, [activeIndex, setEdges, setNodes]);

  useEffect(() => {
    if (!isPlaying || !selectedWorkflow || selectedWorkflow.steps.length <= 1) {
      return;
    }

    const timer = setInterval(() => {
      setActiveIndex((index) => (index + 1) % selectedWorkflow.steps.length);
    }, 1600);

    return () => clearInterval(timer);
  }, [isPlaying, selectedWorkflow]);

  const handleNodeClick = useCallback((_event: MouseEvent, node: Node) => {
    const nodeIndex = Number(node.id.split("-").at(-1));
    if (Number.isNaN(nodeIndex)) {
      return;
    }

    setIsPlaying(false);
    setActiveIndex(nodeIndex);
  }, []);

  if (!selectedWorkflow) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-[0_20px_48px_rgba(0,0,0,0.08)]">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <p className="max-w-xs truncate px-2 text-sm font-medium">{selectedWorkflow.title}</p>
          <Badge variant="outline" className="rounded-full">
            <FormattedMessage {...editorMessages.previewBadge} />
          </Badge>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            aria-label={isPlaying ? copy.pauseLabel : copy.playLabel}
            onClick={() => setIsPlaying((playing) => !playing)}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <HugeiconsIcon icon={isPlaying ? PauseIcon : PlayIcon} className="size-4" />
          </Button>

          <div className="flex flex-wrap gap-1.5">
            {workflows.map((workflow, index) => (
              <button
                key={workflow.title}
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors",
                  selectedIndex === index
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
                )}
                onClick={() => setSelectedIndex(index)}
                type="button"
              >
                {workflow.title}
              </button>
            ))}
          </div>
        </div>
      </header>

      <TypographyMuted className="border-b border-border/60 px-5 py-2" size="small">
        {copy.previewHint}
      </TypographyMuted>

      <div className="relative h-[28rem] w-full">
        <VisualWorkflowCanvasActionsProvider onAddFromNode={() => undefined}>
          <Canvas
            className="h-full w-full"
            defaultEdgeOptions={{
              type: "smoothstep",
              markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
              style: { strokeWidth: 1.5, stroke: "var(--border)" },
            }}
            edges={edges}
            elementsSelectable
            fitView
            fitViewOptions={{ padding: 0.2, minZoom: 0.7, maxZoom: 1.1 }}
            maxZoom={1.25}
            minZoom={0.6}
            nodeTypes={VISUAL_WORKFLOW_NODE_TYPES}
            nodes={nodes as VisualWorkflowRfNode[]}
            nodesConnectable={false}
            nodesDraggable
            onEdgesChange={onEdgesChange as OnEdgesChange}
            onInit={(reactFlow) => {
              void reactFlow.fitView({ padding: 0.2 });
            }}
            onNodeClick={handleNodeClick}
            onNodesChange={onNodesChange as OnNodesChange}
            panOnDrag
            panOnScroll={false}
            preventScrolling={false}
            proOptions={{ hideAttribution: true }}
            selectionOnDrag={false}
            zoomOnScroll={false}
          >
            <Controls showInteractive={false} position="bottom-left" />
          </Canvas>
        </VisualWorkflowCanvasActionsProvider>
      </div>
    </div>
  );
}
