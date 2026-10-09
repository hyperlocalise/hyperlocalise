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

import { automationSetupEditor } from "@/lib/agents/workspace-automation-assistant";
import { buildWorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";
import { isWorkspaceAutomationAssistantForm } from "@/lib/agents/workspace-automation-proposal-form";
import { listWorkspaceAutomationSetupSteps } from "@/lib/agents/workspace-automation-setup-steps";
import type { WorkspaceAutomationSkillConnections } from "@/lib/agents/workspace-automation-skills";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";

import type { AutomationAssistantApi } from "./automation-assistant-api";
import {
  AutomationAssistantSessionProvider,
  type AutomationAssistantMode,
} from "./automation-assistant-session-provider";

export {
  AutomationAssistantContext,
  useAutomationAssistant,
  type AutomationAssistantFailure,
  type AutomationAssistantStatus,
  type AutomationAssistantValue,
} from "./automation-assistant-session-provider";

const FALLBACK_TIME_ZONE = "UTC";

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIME_ZONE;
}

/**
 * The assistant on an automation's form page: the page is the form, what is connected and what
 * the workspace has one of, and the assistant's changes land in the form. Its session is for the
 * saved automation, or made with the first message and thrown away with the page.
 */
export function AutomationAssistantProvider({
  api,
  automationId,
  children,
  connections,
  connectionsSettled,
  contentfulConnectionIds,
  crowdinProjectIds,
  form,
  hasUnsavedChanges = true,
  initialPrompt,
  mode,
  onChange,
  onSessionChange,
  onWorkingChange,
  organizationSlug,
  projectName,
  repositories,
}: {
  /** The calls for the session and its turns, in place of the server's. Must not change. */
  api?: AutomationAssistantApi;
  /** The saved automation the page shows. Absent while a new one is being set up. */
  automationId?: string;
  children?: ReactNode;
  connections: WorkspaceAutomationSkillConnections;
  /** True once every integration status has loaded or failed to load. */
  connectionsSettled: boolean;
  contentfulConnectionIds: readonly string[];
  crowdinProjectIds: readonly string[];
  form: WorkspaceAutomationFormState;
  /**
   * Whether the page holds anything unsaved. Once it does not, the assistant's changes were saved
   * or taken back, and its count of them starts again.
   */
  hasUnsavedChanges?: boolean;
  /** A request handed over from the automations page, sent once the page is ready. */
  initialPrompt?: string | null;
  mode: AutomationAssistantMode;
  /** Called with the form after each of the assistant's changes. */
  onChange: (next: WorkspaceAutomationFormState) => void;
  /** Called when the session for this page starts or ends, with its id. */
  onSessionChange?: (sessionId: string | null) => void;
  onWorkingChange?: (working: boolean) => void;
  organizationSlug: string;
  /** Display name of the project the automation is in, when the page knows it. */
  projectName?: string | null;
  /** Connected repositories. Only a selectable one can be offered as the default. */
  repositories: ReadonlyArray<{ id: string; name: string; selectable: boolean }>;
}) {
  const [editorSessionId] = useState(() => crypto.randomUUID());
  const [timeZone] = useState(browserTimeZone);
  const usable = isWorkspaceAutomationAssistantForm(form);

  const context = useMemo(
    () =>
      usable
        ? buildWorkspaceAutomationEditorContext({
            editorSessionId,
            mode,
            automationId,
            form,
            connections,
            timeZone,
            repositories,
            crowdinProjectIds,
            contentfulConnectionIds,
            projectName,
          })
        : null,
    [
      automationId,
      connections,
      contentfulConnectionIds,
      crowdinProjectIds,
      projectName,
      editorSessionId,
      form,
      mode,
      repositories,
      timeZone,
      usable,
    ],
  );
  const sessionKey = useMemo(() => (automationId ? { automationId } : null), [automationId]);
  const steps = useMemo(
    () => listWorkspaceAutomationSetupSteps({ form, connections }),
    [connections, form],
  );

  return (
    <AutomationAssistantSessionProvider
      api={api}
      organizationSlug={organizationSlug}
      target={{
        editor: automationSetupEditor,
        editorSessionId,
        context,
        document: form,
        onChange,
        sessionKey,
        mode,
        title: form.name,
        hasUnsavedChanges,
        initialPrompt,
        ready: connectionsSettled,
        steps,
        onSessionChange,
        onWorkingChange,
      }}
    >
      {children}
    </AutomationAssistantSessionProvider>
  );
}
