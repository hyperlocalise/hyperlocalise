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
import { useEffect, useMemo, useState } from "react";
import { Handle, Position, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Canvas } from "@/components/ai-elements/canvas";
import { Edge as FlowEdge } from "@/components/ai-elements/edge";
import { cn } from "@/lib/primitives/cn";

import { contentOpsMockStageMessages } from "./content-ops-mock-stage.messages";

type FlowTemplateId = "brief" | "campaign" | "seo";

type FlowNodeData = {
  label: string;
  active?: boolean;
};

function WorkflowNode({ data }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div
      className={cn(
        "min-w-[7.5rem] rounded-lg border border-border bg-background px-3 py-2 text-center text-[11px] font-medium shadow-sm transition-all",
        data.active && "border-primary/50 bg-primary/5 ring-2 ring-primary/25",
      )}
    >
      <Handle
        className="!size-1.5 !border-border !bg-muted-foreground"
        position={Position.Left}
        type="target"
      />
      <span className="text-foreground">{data.label}</span>
      <Handle
        className="!size-1.5 !border-border !bg-muted-foreground"
        position={Position.Right}
        type="source"
      />
    </div>
  );
}

const nodeTypes = { workflow: WorkflowNode };
const edgeTypes = { animated: FlowEdge.Animated };

const NODE_SPACING_X = 160;
const NODE_Y = 72;

function buildLinearFlow(
  templateId: FlowTemplateId,
  labels: string[],
  activeIndex: number,
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const nodes: Node<FlowNodeData>[] = labels.map((label, index) => ({
    id: `${templateId}-${index}`,
    type: "workflow",
    position: { x: index * NODE_SPACING_X, y: NODE_Y },
    data: { label, active: index === activeIndex },
    draggable: false,
  }));

  const edges: Edge[] = labels.slice(0, -1).map((_, index) => ({
    id: `${templateId}-e-${index}`,
    source: `${templateId}-${index}`,
    target: `${templateId}-${index + 1}`,
    type: index === activeIndex ? "animated" : "default",
    animated: index === activeIndex,
  }));

  return { nodes, edges };
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

  const templateLabels = useMemo(
    () => ({
      brief: [
        intl.formatMessage(contentOpsMockStageMessages.flowNodeBrief),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeLocalise),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeBrandQa),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeReview),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeCms),
      ],
      campaign: [
        intl.formatMessage(contentOpsMockStageMessages.flowNodeBrief),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeLocalise),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeReview),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeStaging),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeSlack),
      ],
      seo: [
        intl.formatMessage(contentOpsMockStageMessages.flowNodeSchedule),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeKeywords),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeLocalise),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeDraft),
        intl.formatMessage(contentOpsMockStageMessages.flowNodeSlack),
      ],
    }),
    [intl],
  );

  const labels = templateLabels[templateId];
  const { nodes, edges } = useMemo(
    () => buildLinearFlow(templateId, labels, activeIndex),
    [activeIndex, labels, templateId],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [templateId]);

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
    { id: "seo", label: contentOpsMockStageMessages.flowTemplateSeo },
  ];

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-border/80 bg-background/90 shadow-lg backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="text-sm font-semibold text-foreground">
          <FormattedMessage {...contentOpsMockStageMessages.flowTitle} />
        </div>
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

      <div className="h-[14rem] w-full sm:h-[16rem]">
        <Canvas
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          panOnScroll={false}
          panOnDrag={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: 0.35 }}
        />
      </div>
    </div>
  );
}
