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
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useIntl } from "react-intl";

import { visualWorkflowEditor } from "@/lib/agents/visual-workflow-assistant";
import { buildVisualWorkflowEditorContext } from "@/lib/agents/visual-workflow-editor-context";
import { isTriggerType } from "@/lib/visual-workflows/catalog/node-catalog";
import { splitTemplate } from "@/lib/visual-workflows/editor/visual-workflow-upstream-fields";
import type { VisualWorkflowGraph } from "@/lib/visual-workflows/editor/visual-workflow-undo";
import { toVisualWorkflowV3Definition } from "@/lib/visual-workflows/schema/serializers";

import type { AutomationAssistantApi } from "./automation-assistant-api";
import { AutomationAssistantSessionProvider } from "./automation-assistant-session-provider";
import { visualWorkflowNodeTitleMessage } from "./visual-workflow-editor/visual-workflow-node-picker";

/**
 * The assistant on a visual workflow's editor: the page is the workflow as the canvas holds it,
 * and the assistant's changes land on the canvas as one undo step each. Its session is for the
 * saved workflow, which exists before the editor opens, so it is never unbound.
 */
export function AutomationAssistantVisualWorkflowProvider({
  api,
  children,
  graph,
  hasUnsavedChanges = true,
  onChange,
  onWorkingChange,
  organizationSlug,
  projectName,
  reservedNodeIds,
  visualWorkflowId,
}: {
  /** The calls for the session and its turns, in place of the server's. Must not change. */
  api?: AutomationAssistantApi;
  children?: ReactNode;
  /** The workflow as the canvas holds it. */
  graph: VisualWorkflowGraph;
  /**
   * Whether the page holds anything unsaved. Once it does not, the assistant's changes were saved
   * or taken back, and its count of them starts again.
   */
  hasUnsavedChanges?: boolean;
  /** Called with the workflow after each of the assistant's changes, and the turn that made it. */
  onChange: (next: VisualWorkflowGraph, turn: string) => void;
  onWorkingChange?: (working: boolean) => void;
  organizationSlug: string;
  /** Display name of the project the workflow is in, when the page knows it. */
  projectName?: string | null;
  /** Ids no step on the canvas has that a new step must not take. */
  reservedNodeIds?: readonly string[];
  visualWorkflowId: string;
}) {
  const [editorSessionId] = useState(() => crypto.randomUUID());
  const context = useMemo(
    () =>
      buildVisualWorkflowEditorContext({
        editorSessionId,
        visualWorkflowId,
        definition: toVisualWorkflowV3Definition(graph),
        projectName,
        reservedNodeIds,
      }),
    [editorSessionId, graph, projectName, reservedNodeIds, visualWorkflowId],
  );
  const sessionKey = useMemo(() => ({ visualWorkflowId }), [visualWorkflowId]);
  const intl = useIntl();
  // A reference in a reply reads as the step's title and the field, as a pill in a setting does.
  const referenceLabel = useCallback(
    (reference: string) => {
      const segment = splitTemplate(reference.trim()).find((entry) => entry.kind === "reference");
      if (!segment || segment.kind !== "reference") return null;
      const node = segment.trigger
        ? graph.nodes.find((entry) => isTriggerType(entry.data.catalogType))
        : graph.nodes.find((entry) => entry.id === segment.nodeId);
      if (!node) return null;
      const title = intl.formatMessage(visualWorkflowNodeTitleMessage(node.data.catalogType));
      return [title, ...segment.path].join(" › ");
    },
    [graph.nodes, intl],
  );

  return (
    <AutomationAssistantSessionProvider
      api={api}
      organizationSlug={organizationSlug}
      target={{
        editor: visualWorkflowEditor,
        editorSessionId,
        context,
        document: graph,
        onChange,
        sessionKey,
        mode: "visual_workflow",
        title: graph.name,
        hasUnsavedChanges,
        ready: true,
        referenceLabel,
        onWorkingChange,
      }}
    >
      {children}
    </AutomationAssistantSessionProvider>
  );
}
