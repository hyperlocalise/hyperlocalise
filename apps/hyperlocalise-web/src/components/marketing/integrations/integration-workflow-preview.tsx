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
  Background,
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  type Node,
  type NodeProps,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import { PauseIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Canvas } from "@/components/ai-elements/canvas";
import { IntegrationLogoMark } from "@/components/marketing/integrations/integration-logo-mark";
import { getIntegrationCatalogEntry } from "@/lib/integrations/integration-catalog";
import type {
  IntegrationIconKey,
  ResolvedIntegrationWorkflow,
} from "@/lib/integrations/integration-catalog.types";
import {
  buildWorkflowEdges,
  buildWorkflowNodes,
  styleWorkflowEdges,
  type IntegrationWorkflowNodeData,
} from "@/lib/integrations/integration-workflow-graph";
import { Button } from "@/components/ui/button";
import { TypographyMuted, TypographyP } from "@/components/ui/typography";
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

const KIND_HEADER_CLASS = {
  trigger: "border-rose-500/25 bg-rose-500/12 text-rose-900 dark:text-rose-100",
  action: "border-sky-500/25 bg-sky-500/12 text-sky-950 dark:text-sky-100",
} as const;

function getActorBranding(actorSlug: string) {
  if (actorSlug === "hyperlocalise") {
    return {
      name: "Hyperlocalise",
      logoSrc: "/images/logo.png",
      iconKey: undefined as IntegrationIconKey | undefined,
    };
  }

  const entry = getIntegrationCatalogEntry(actorSlug);
  return {
    name: entry?.slug ?? actorSlug,
    logoSrc: entry?.logoSrc,
    iconKey: entry?.iconKey,
  };
}

function IntegrationWorkflowNode({ data }: NodeProps<Node<IntegrationWorkflowNodeData>>) {
  const branding = getActorBranding(data.actorSlug);

  return (
    <div
      className={cn(
        "w-[14rem] overflow-hidden rounded-xl border border-border/80 bg-background text-left shadow-md shadow-black/8 transition-shadow",
        data.active && "ring-2 ring-primary/35 shadow-lg shadow-primary/10",
      )}
    >
      <Handle
        className="!size-2 !border-border !bg-background"
        position={Position.Top}
        type="target"
      />

      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b px-3 py-1.5 text-[10px] font-semibold tracking-[0.06em] uppercase",
          KIND_HEADER_CLASS[data.kind],
        )}
      >
        <span>{data.kindLabel}</span>
        <IntegrationLogoMark
          iconKey={branding.iconKey}
          logoSrc={branding.logoSrc}
          name={branding.name}
          size="sm"
        />
      </div>

      <div className="space-y-1 px-3 py-2.5">
        <p className="text-[0.8rem] font-medium leading-snug text-foreground">{data.label}</p>
        {data.description ? (
          <p className="text-[0.7rem] leading-snug text-muted-foreground">{data.description}</p>
        ) : null}
      </div>

      <Handle
        className="!size-2 !border-border !bg-background"
        position={Position.Bottom}
        type="source"
      />
    </div>
  );
}

const nodeTypes = { integrationWorkflow: IntegrationWorkflowNode };

function buildFlowState(
  workflow: ResolvedIntegrationWorkflow,
  workflowKey: string,
  integrationSlug: string,
  integrationNamesBySlug: Readonly<Record<string, string>>,
  kindLabels: { trigger: string; action: string },
  activeIndex: number,
) {
  const nodes = buildWorkflowNodes(
    workflow,
    workflowKey,
    integrationSlug,
    integrationNamesBySlug,
    kindLabels,
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

  const kindLabels = useMemo(
    () => ({
      trigger: copy.triggerLabel,
      action: copy.actionLabel,
    }),
    [copy.actionLabel, copy.triggerLabel],
  );

  const initialFlow = useMemo(
    () =>
      buildFlowState(
        selectedWorkflow,
        workflowKey,
        integrationSlug,
        integrationNamesBySlug,
        kindLabels,
        activeIndex,
      ),
    [
      activeIndex,
      integrationNamesBySlug,
      integrationSlug,
      kindLabels,
      selectedWorkflow,
      workflowKey,
    ],
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
        kindLabels,
        nextActiveIndex,
      );
      setNodes(nextFlow.nodes);
      setEdges(nextFlow.edges);
    },
    [integrationNamesBySlug, integrationSlug, kindLabels, setEdges, setNodes],
  );

  useEffect(() => {
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
          active: index === activeIndex,
        },
      })),
    );
    setEdges((current) => styleWorkflowEdges(current, activeIndex));
  }, [activeIndex, setEdges, setNodes]);

  useEffect(() => {
    if (!isPlaying || selectedWorkflow.steps.length <= 1) {
      return;
    }

    const timer = setInterval(() => {
      setActiveIndex((index) => (index + 1) % selectedWorkflow.steps.length);
    }, 1600);

    return () => clearInterval(timer);
  }, [isPlaying, selectedWorkflow.steps.length]);

  const handleNodeClick = useCallback(
    (_event: MouseEvent, node: Node<IntegrationWorkflowNodeData>) => {
      const nodeIndex = Number(node.id.split("-").at(-1));
      if (Number.isNaN(nodeIndex)) {
        return;
      }

      setIsPlaying(false);
      setActiveIndex(nodeIndex);
    },
    [],
  );

  if (!selectedWorkflow) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-[0_20px_48px_rgba(0,0,0,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="min-w-0 space-y-1">
          <TypographyP weight="medium">{selectedWorkflow.title}</TypographyP>
          <TypographyMuted size="small">{copy.previewHint}</TypographyMuted>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
      </div>

      <div className="relative min-h-[22rem] w-full">
        <Canvas
          defaultEdgeOptions={{
            type: "smoothstep",
            style: { strokeWidth: 1.5, stroke: "var(--border)" },
          }}
          edges={edges}
          elementsSelectable
          fitView
          fitViewOptions={{ padding: 0.45, minZoom: 0.85, maxZoom: 1.1 }}
          maxZoom={1.25}
          minZoom={0.75}
          nodeTypes={nodeTypes}
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable
          onEdgesChange={onEdgesChange as OnEdgesChange}
          onNodeClick={handleNodeClick}
          onNodesChange={onNodesChange as OnNodesChange}
          panOnDrag
          panOnScroll={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          selectionOnDrag={false}
          zoomOnScroll={false}
        >
          <Background color="var(--border)" gap={18} size={1} />
        </Canvas>
      </div>
    </div>
  );
}
