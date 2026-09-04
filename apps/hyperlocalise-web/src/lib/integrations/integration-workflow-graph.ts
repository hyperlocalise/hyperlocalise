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
import type { Edge, Node } from "@xyflow/react";

import type { ResolvedIntegrationWorkflow } from "@/lib/integrations/integration-catalog.types";

export type WorkflowNodeKind = "trigger" | "action";

export type IntegrationWorkflowNodeData = {
  label: string;
  description?: string;
  kind: WorkflowNodeKind;
  kindLabel: string;
  actorSlug: string;
  actorName: string;
  active?: boolean;
};

const NODE_GAP_Y = 108;
const HYPERLOCALISE_SLUG = "hyperlocalise";

export function inferWorkflowStepActor(
  label: string,
  stepIndex: number,
  primaryIntegrationSlug: string,
  integrationNamesBySlug: Readonly<Record<string, string>>,
): string {
  if (/hyperlocalise/i.test(label)) {
    return HYPERLOCALISE_SLUG;
  }

  for (const [slug, name] of Object.entries(integrationNamesBySlug)) {
    if (slug === primaryIntegrationSlug) {
      continue;
    }

    if (name && label.toLowerCase().includes(name.toLowerCase())) {
      return slug;
    }
  }

  const primaryName = integrationNamesBySlug[primaryIntegrationSlug];
  if (primaryName && label.toLowerCase().includes(primaryName.toLowerCase())) {
    return primaryIntegrationSlug;
  }

  if (stepIndex === 0) {
    return primaryIntegrationSlug;
  }

  return HYPERLOCALISE_SLUG;
}

export function buildWorkflowEdges(workflowKey: string, stepCount: number): Edge[] {
  return Array.from({ length: stepCount - 1 }, (_, index) => ({
    id: `${workflowKey}-edge-${index}`,
    source: `${workflowKey}-node-${index}`,
    target: `${workflowKey}-node-${index + 1}`,
  }));
}

export function buildWorkflowNodes(
  workflow: ResolvedIntegrationWorkflow,
  workflowKey: string,
  primaryIntegrationSlug: string,
  integrationNamesBySlug: Readonly<Record<string, string>>,
  kindLabels: { trigger: string; action: string },
  activeIndex: number,
): Node<IntegrationWorkflowNodeData>[] {
  return workflow.steps.map((step, index) => {
    const actorSlug = inferWorkflowStepActor(
      step.label,
      index,
      primaryIntegrationSlug,
      integrationNamesBySlug,
    );

    return {
      id: `${workflowKey}-node-${index}`,
      type: "integrationWorkflow",
      position: { x: 0, y: index * NODE_GAP_Y },
      data: {
        label: step.label,
        description: step.description,
        kind: index === 0 ? "trigger" : "action",
        kindLabel: index === 0 ? kindLabels.trigger : kindLabels.action,
        actorSlug,
        actorName: integrationNamesBySlug[actorSlug] ?? "Hyperlocalise",
        active: index === activeIndex,
      },
      draggable: true,
    };
  });
}

export function styleWorkflowEdges(edges: Edge[], activeIndex: number): Edge[] {
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
