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
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Canvas } from "@/components/ai-elements/canvas";
import { cn } from "@/lib/primitives/cn";

import { CONTENT_OPS_MOCK_INNER_CLASSNAME } from "./content-ops-mock-stage.constants";
import { contentOpsMockStageMessages } from "./content-ops-mock-stage.messages";

type FlowTemplateId = "brief" | "campaign";

type FlowNodeKind = "trigger" | "action";

type FlowNodeData = {
  label: string;
  kind: FlowNodeKind;
  kindLabel: string;
  active?: boolean;
};

type FlowLayoutNode = {
  label: string;
  kind: FlowNodeKind;
  position: { x: number; y: number };
};

const NODE_GAP_Y = 108;

const KIND_HEADER_CLASS: Record<FlowNodeKind, string> = {
  trigger: "border-rose-500/25 bg-rose-500/12 text-rose-900 dark:text-rose-100",
  action: "border-sky-500/25 bg-sky-500/12 text-sky-950 dark:text-sky-100",
};

function WorkflowNode({ data }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div
      className={cn(
        "w-[12.25rem] overflow-hidden rounded-xl border border-border/80 bg-background shadow-md shadow-black/8 transition-shadow",
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
        <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} className="size-3 opacity-60" />
      </div>

      <div className="px-3 py-2.5 text-[0.8rem] font-medium leading-snug text-foreground">
        {data.label}
      </div>

      <Handle
        className="!size-2 !border-border !bg-background"
        position={Position.Bottom}
        type="source"
      />
    </div>
  );
}

const nodeTypes = { workflow: WorkflowNode };

function buildLayout(templateId: FlowTemplateId, labels: string[]): FlowLayoutNode[] {
  const baseY = 0;
  const centerX = 0;

  if (templateId === "brief") {
    return labels.map((label, index) => {
      if (index <= 4) {
        return {
          label,
          kind: index === 0 ? "trigger" : "action",
          position: { x: centerX, y: baseY + index * NODE_GAP_Y },
        };
      }

      if (index === 5) {
        return {
          label,
          kind: "action",
          position: { x: centerX - 112, y: baseY + 5 * NODE_GAP_Y },
        };
      }

      return {
        label,
        kind: "action",
        position: { x: centerX + 112, y: baseY + 5 * NODE_GAP_Y },
      };
    });
  }

  if (templateId === "campaign") {
    return labels.map((label, index) => {
      if (index <= 2) {
        return {
          label,
          kind: index === 0 ? "trigger" : "action",
          position: { x: centerX, y: baseY + index * NODE_GAP_Y },
        };
      }
      if (index === 3) {
        return {
          label,
          kind: "action",
          position: { x: centerX - 112, y: baseY + 3 * NODE_GAP_Y },
        };
      }
      return {
        label,
        kind: "action",
        position: { x: centerX + 112, y: baseY + 3 * NODE_GAP_Y },
      };
    });
  }

  return labels.map((label, index) => ({
    label,
    kind: index === 0 ? "trigger" : "action",
    position: { x: centerX, y: baseY + index * NODE_GAP_Y },
  }));
}

function buildEdges(templateId: FlowTemplateId, templateKey: string, nodeCount: number): Edge[] {
  if (templateId === "brief") {
    return [
      { id: `${templateKey}-e-0`, source: `${templateKey}-0`, target: `${templateKey}-1` },
      { id: `${templateKey}-e-1`, source: `${templateKey}-1`, target: `${templateKey}-2` },
      { id: `${templateKey}-e-2`, source: `${templateKey}-2`, target: `${templateKey}-3` },
      { id: `${templateKey}-e-3`, source: `${templateKey}-3`, target: `${templateKey}-4` },
      { id: `${templateKey}-e-4`, source: `${templateKey}-4`, target: `${templateKey}-5` },
      { id: `${templateKey}-e-5`, source: `${templateKey}-4`, target: `${templateKey}-6` },
    ];
  }

  if (templateId === "campaign") {
    return [
      { id: `${templateKey}-e-0`, source: `${templateKey}-0`, target: `${templateKey}-1` },
      { id: `${templateKey}-e-1`, source: `${templateKey}-1`, target: `${templateKey}-2` },
      { id: `${templateKey}-e-2`, source: `${templateKey}-2`, target: `${templateKey}-3` },
      { id: `${templateKey}-e-3`, source: `${templateKey}-2`, target: `${templateKey}-4` },
    ];
  }

  return Array.from({ length: nodeCount - 1 }, (_, index) => ({
    id: `${templateKey}-e-${index}`,
    source: `${templateKey}-${index}`,
    target: `${templateKey}-${index + 1}`,
  }));
}

function buildFlowNodes(
  templateId: FlowTemplateId,
  labels: string[],
  kindLabels: { trigger: string; action: string },
  activeIndex: number,
): Node<FlowNodeData>[] {
  const layout = buildLayout(templateId, labels);

  return layout.map((item, index) => ({
    id: `${templateId}-${index}`,
    type: "workflow",
    position: item.position,
    data: {
      label: item.label,
      kind: item.kind,
      kindLabel: item.kind === "trigger" ? kindLabels.trigger : kindLabels.action,
      active: index === activeIndex,
    },
    draggable: true,
  }));
}

function styleEdges(edges: Edge[], activeIndex: number): Edge[] {
  return edges.map((edge) => {
    const sourceIndex = Number(edge.source.split("-").at(-1));
    const isActivePath = sourceIndex === activeIndex;
    const isCompletePath = sourceIndex < activeIndex;

    return {
      ...edge,
      animated: isActivePath,
      style: {
        strokeWidth: isCompletePath || isActivePath ? 2 : 1.5,
        stroke: isCompletePath || isActivePath ? "var(--primary)" : "var(--border)",
      },
    };
  });
}

export function ContentOpsFlowPanel({
  pauseAutoplay = false,
  onActiveNodeChange,
}: {
  pauseAutoplay?: boolean;
  onActiveNodeChange?: (nodeIndex: number) => void;
}) {
  const intl = useIntl();
  const [templateId, setTemplateId] = useState<FlowTemplateId>("brief");
  const [activeIndex, setActiveIndex] = useState(0);

  const kindLabels = useMemo(
    () => ({
      trigger: intl.formatMessage(contentOpsMockStageMessages.flowNodeKindTrigger),
      action: intl.formatMessage(contentOpsMockStageMessages.flowNodeKindAction),
    }),
    [intl],
  );

  const templateLabels = useMemo(
    () => ({
      brief: [
        intl.formatMessage(contentOpsMockStageMessages.flowNodeSchedule),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeKeywords),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeCreateContent),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeLocalise),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeReview),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeSlack),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeCms),
      ],
      campaign: [
        intl.formatMessage(contentOpsMockStageMessages.flowNodeBrief),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeLocalise),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeReview),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeStaging),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeSlack),
      ],
    }),
    [intl],
  );

  const templateMeta = useMemo(
    () => ({
      brief: {
        title: contentOpsMockStageMessages.flowTemplateBrief,
        description: contentOpsMockStageMessages.flowBriefDescription,
      },
      campaign: {
        title: contentOpsMockStageMessages.flowTemplateCampaign,
        description: contentOpsMockStageMessages.flowCampaignDescription,
      },
    }),
    [],
  );

  const labels = templateLabels[templateId];
  const initialNodes = useMemo(
    () => buildFlowNodes(templateId, labels, kindLabels, activeIndex),
    [activeIndex, kindLabels, labels, templateId],
  );
  const initialEdges = useMemo(
    () => styleEdges(buildEdges(templateId, templateId, labels.length), activeIndex),
    [activeIndex, labels.length, templateId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const resetFlow = useCallback(
    (nextTemplateId: FlowTemplateId, nextActiveIndex: number) => {
      const nextLabels = templateLabels[nextTemplateId];
      setNodes(buildFlowNodes(nextTemplateId, nextLabels, kindLabels, nextActiveIndex));
      setEdges(
        styleEdges(buildEdges(nextTemplateId, nextTemplateId, nextLabels.length), nextActiveIndex),
      );
    },
    [kindLabels, setEdges, setNodes, templateLabels],
  );

  useEffect(() => {
    setActiveIndex(0);
    resetFlow(templateId, 0);
  }, [templateId, resetFlow]);

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
    setEdges((current) => styleEdges(current, activeIndex));
  }, [activeIndex, setEdges, setNodes]);

  useEffect(() => {
    onActiveNodeChange?.(activeIndex);
  }, [activeIndex, onActiveNodeChange]);

  useEffect(() => {
    if (pauseAutoplay) {
      return;
    }

    const timer = setInterval(() => {
      setActiveIndex((index) => (index + 1) % labels.length);
    }, 1400);

    return () => clearInterval(timer);
  }, [labels.length, pauseAutoplay]);

  const templates: {
    id: FlowTemplateId;
    label: typeof contentOpsMockStageMessages.flowTemplateBrief;
  }[] = [
    { id: "brief", label: contentOpsMockStageMessages.flowTemplateBrief },
    { id: "campaign", label: contentOpsMockStageMessages.flowTemplateCampaign },
  ];

  const meta = templateMeta[templateId];

  return (
    <div className={CONTENT_OPS_MOCK_INNER_CLASSNAME}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-5 py-4">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold tracking-[-0.02em] text-foreground">
            <FormattedMessage {...meta.title} />
          </p>
          <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
            <FormattedMessage {...meta.description} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden text-[10px] text-muted-foreground sm:inline">
            <FormattedMessage {...contentOpsMockStageMessages.flowDragHint} />
          </span>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setTemplateId(template.id)}
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors",
                  templateId === template.id
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <FormattedMessage {...template.label} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative min-h-0 min-h-[28rem] flex-1 w-full">
        <Canvas
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange as OnNodesChange}
          onEdgesChange={onEdgesChange as OnEdgesChange}
          nodesConnectable={false}
          nodesDraggable
          elementsSelectable
          zoomOnScroll={false}
          panOnScroll
          panOnDrag
          selectionOnDrag={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: 0.35, minZoom: 0.75, maxZoom: 1.05 }}
          minZoom={0.75}
          maxZoom={1.25}
          defaultEdgeOptions={{
            type: "smoothstep",
            style: { strokeWidth: 1.5, stroke: "var(--border)" },
          }}
        >
          <Background gap={18} size={1} color="var(--border)" />
        </Canvas>
      </div>
    </div>
  );
}
