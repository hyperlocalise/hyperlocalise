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

import type { ResolvedIntegrationWorkflow } from "@/lib/integrations/integration-catalog.types";
import { createDefaultConfig } from "@/lib/visual-workflows/catalog/node-catalog";
import type {
  MockNodeRunStatus,
  VisualCatalogType,
  VisualWorkflowRfNode,
} from "@/lib/visual-workflows/schema/types";

const NODE_GAP_X = 260;
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

export function inferWorkflowStepCatalogType(
  label: string,
  stepIndex: number,
  actorSlug: string,
): VisualCatalogType {
  const text = label.toLowerCase();

  if (stepIndex === 0) {
    if (/\bupload\b/.test(text)) {
      return "trigger.source_upload";
    }

    if (/\b(hourly|daily|weekly|scheduled|cron)\b/.test(text)) {
      return "trigger.scheduled";
    }

    if (
      actorSlug === "github" ||
      actorSlug === "gitlab" ||
      /\b(github|gitlab|pull request|merge request|\bpr\b|\bmr\b|branch|push)\b/.test(text)
    ) {
      return "trigger.github";
    }

    return "trigger.manual";
  }

  if (actorSlug === "slack" || /slack|notified|alert posted|#\w+/i.test(text)) {
    return "action.notify_slack";
  }

  if (
    actorSlug === HYPERLOCALISE_SLUG ||
    /\b(agent|scan|draft|flag|qa|review|translat)\b/.test(text)
  ) {
    return "ai.agent";
  }

  return "action.http";
}

export function buildWorkflowEdges(workflowKey: string, stepCount: number): Edge[] {
  return Array.from({ length: stepCount - 1 }, (_, index) => ({
    id: `${workflowKey}-edge-${index}`,
    source: `${workflowKey}-node-${index}`,
    target: `${workflowKey}-node-${index + 1}`,
  }));
}

function runStatusForIndex(index: number, activeIndex: number): MockNodeRunStatus {
  if (index < activeIndex) {
    return "succeeded";
  }

  if (index === activeIndex) {
    return "running";
  }

  return "idle";
}

export function buildWorkflowNodes(
  workflow: ResolvedIntegrationWorkflow,
  workflowKey: string,
  primaryIntegrationSlug: string,
  integrationNamesBySlug: Readonly<Record<string, string>>,
  activeIndex: number,
): VisualWorkflowRfNode[] {
  return workflow.steps.map((step, index) => {
    const actorSlug = inferWorkflowStepActor(
      step.label,
      index,
      primaryIntegrationSlug,
      integrationNamesBySlug,
    );
    const catalogType = inferWorkflowStepCatalogType(step.label, index, actorSlug);

    return {
      id: `${workflowKey}-node-${index}`,
      type: catalogType,
      position: { x: index * NODE_GAP_X, y: 0 },
      data: {
        catalogType,
        config: createDefaultConfig(catalogType),
        runStatus: runStatusForIndex(index, activeIndex),
        previewSubtitle: step.description ?? step.label,
        hideAddAction: true,
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
