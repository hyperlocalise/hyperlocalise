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
import { useMemo, useState, type ReactNode } from "react";

import { visualWorkflowEditor } from "@/lib/agents/visual-workflow-assistant";
import { buildVisualWorkflowEditorContext } from "@/lib/agents/visual-workflow-editor-context";
import type { VisualWorkflowGraph } from "@/lib/visual-workflows/editor/visual-workflow-undo";
import { toVisualWorkflowV3Definition } from "@/lib/visual-workflows/schema/serializers";

import type { AutomationAssistantApi } from "./automation-assistant-api";
import { AutomationAssistantSessionProvider } from "./automation-assistant-session-provider";

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
  /** Called with the workflow after each of the assistant's changes. */
  onChange: (next: VisualWorkflowGraph) => void;
  onWorkingChange?: (working: boolean) => void;
  organizationSlug: string;
  /** Display name of the project the workflow is in, when the page knows it. */
  projectName?: string | null;
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
      }),
    [editorSessionId, graph, projectName, visualWorkflowId],
  );
  const sessionKey = useMemo(() => ({ visualWorkflowId }), [visualWorkflowId]);

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
        onWorkingChange,
      }}
    >
      {children}
    </AutomationAssistantSessionProvider>
  );
}
