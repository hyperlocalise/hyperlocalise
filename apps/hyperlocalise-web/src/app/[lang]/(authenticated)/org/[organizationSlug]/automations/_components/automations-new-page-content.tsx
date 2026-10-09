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
import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { buildAutomationsPath } from "@/components/app-shell/navigation-config";
import { apiClient } from "@/lib/api-client-instance";
import {
  workspaceAutomationUndoStackOptions,
  type WorkspaceAutomationFormChange,
} from "@/lib/agents/workspace-automation-undo";
import { useUndoShortcuts } from "@/lib/undo-stack/use-undo-shortcuts";
import { takeAutomationAssistantHandoff } from "@/lib/automation-assistant/handoff";
import { useUndoStack } from "@/lib/undo-stack/use-undo-stack";
import {
  createDefaultWorkspaceAutomationFormState,
  formStateToWorkspaceAutomationPayload,
  mapWorkspaceAutomationApiErrorToFieldErrors,
  validateWorkspaceAutomationFormState,
  workspaceAutomationFormHasChanges,
  type WorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";
import { useUnsavedChangesLeaveGuard } from "../../_components/unsaved-changes-leave-guard";
import { WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { bindAssistantSession } from "./automation-assistant-api";
import { AUTOMATION_ASSISTANT_PAGE_CLASS } from "./automation-assistant-panel";
import { useAssistantUndoSteps } from "./automation-assistant-undo-steps";
import { AutomationUndoRedoButtons, useAutomationUndoNotice } from "./automation-undo-controls";
import { automationsNewPageContentMessages } from "./automations-new-page-content.messages";
import { WorkspaceAutomationEditor } from "./workspace-automation-form";

export function AutomationsNewPageContent({
  organizationSlug,
  projectId,
  initialForm = createDefaultWorkspaceAutomationFormState(),
  knowledgeAvailable = false,
  canUpdateKnowledgeMemory = false,
  assistantEnabled = false,
  startsFromTemplate = false,
}: {
  organizationSlug: string;
  projectId?: string;
  initialForm?: WorkspaceAutomationFormState;
  knowledgeAvailable?: boolean;
  canUpdateKnowledgeMemory?: boolean;
  assistantEnabled?: boolean;
  /** A template was asked for by its link, so a request handed over from the list is dropped. */
  startsFromTemplate?: boolean;
}) {
  const intl = useIntl();
  const [startForm] = useState(initialForm);
  const [assistantSessionId, setAssistantSessionId] = useState<string | null>(null);
  const [assistantWorking, setAssistantWorking] = useState(false);
  // The request typed on the automations page, taken once so a reload does not send it again.
  const [assistantInitialPrompt] = useState(() =>
    assistantEnabled && !startsFromTemplate ? takeAutomationAssistantHandoff() : null,
  );
  const history = useUndoStack<
    WorkspaceAutomationFormState | null,
    WorkspaceAutomationFormChange | null
  >(startForm, workspaceAutomationUndoStackOptions);
  const form = history.form ?? startForm;
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const automationsBasePath = buildAutomationsPath(organizationSlug, { projectId });
  const hasUnsavedChanges = workspaceAutomationFormHasChanges(form, startForm);
  const { leaveGuardDialog, leaveTo } = useUnsavedChangesLeaveGuard(
    hasUnsavedChanges || assistantWorking,
  );
  const { notifyUndo, notifyRedo } = useAutomationUndoNotice();
  // The notice's action runs after later renders, so it reads the history as it is then.
  const historyRef = useRef(history);
  historyRef.current = history;

  const runRedo = () => {
    const step = historyRef.current.redoStep;
    if (!step) {
      return;
    }
    historyRef.current.redo();
    setErrors({});
    notifyRedo(step, runUndo);
  };
  const performUndo = () => {
    const step = historyRef.current.undoStep;
    if (!step) {
      return;
    }
    historyRef.current.undo();
    setErrors({});
    notifyUndo(step, runRedo);
  };
  const { runUndo, applyAssistantChange, undoConfirmDialog } = useAssistantUndoSteps(
    historyRef,
    performUndo,
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const fieldErrors = validateWorkspaceAutomationFormState(form);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        throw new Error("validation_failed");
      }

      const payload = formStateToWorkspaceAutomationPayload(form);
      if (payload.kind === "content_sync") {
        throw new Error("validation_failed");
      }
      const response = await apiClient.api.orgs[":organizationSlug"].automations.$post({
        param: { organizationSlug },
        json: payload,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        if (body?.error) {
          setErrors(mapWorkspaceAutomationApiErrorToFieldErrors(body.error));
        }
        throw new Error(
          body?.message ?? intl.formatMessage(automationsNewPageContentMessages.createFailed),
        );
      }

      return response.json();
    },
    onSuccess: async (body) => {
      // The assistant's conversation follows the automation to its own page.
      if (assistantSessionId) {
        await bindAssistantSession(organizationSlug, assistantSessionId, body.automation.id).catch(
          () => undefined,
        );
      }
      toast.success(intl.formatMessage(automationsNewPageContentMessages.createSuccess));
      leaveTo(`${automationsBasePath}/${body.automation.id}`);
    },
    onError: (error) => {
      if (error.message === "validation_failed") {
        return;
      }
      toast.error(intl.formatMessage(automationsNewPageContentMessages.createError));
    },
  });

  const { rootRef } = useUndoShortcuts({
    enabled: !createMutation.isPending,
    onUndo: runUndo,
    onRedo: runRedo,
    onSeal: history.seal,
  });

  const actions = (
    <>
      <AutomationUndoRedoButtons
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        undoStep={history.undoStep}
        redoStep={history.redoStep}
        disabled={createMutation.isPending}
        onUndo={runUndo}
        onRedo={runRedo}
      />
      <Button
        variant="outline"
        nativeButton={false}
        render={<OrgNavLink href={automationsBasePath} />}
      >
        <FormattedMessage {...automationsNewPageContentMessages.cancel} />
      </Button>
      <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
        {createMutation.isPending ? (
          <FormattedMessage {...automationsNewPageContentMessages.creating} />
        ) : (
          <FormattedMessage {...automationsNewPageContentMessages.createAutomation} />
        )}
      </Button>
    </>
  );

  return (
    <WorkspacePageShell
      ref={rootRef}
      // With the assistant offered the page is two panes that fill the app's content area.
      className={assistantEnabled ? AUTOMATION_ASSISTANT_PAGE_CLASS : "max-w-5xl"}
      data-undo-root="automation"
    >
      <WorkspaceAutomationEditor
        mode="create"
        organizationSlug={organizationSlug}
        form={form}
        errors={errors}
        knowledgeAvailable={knowledgeAvailable}
        canUpdateKnowledgeMemory={canUpdateKnowledgeMemory}
        assistantEnabled={assistantEnabled}
        assistantHasUnsavedChanges={hasUnsavedChanges}
        assistantInitialPrompt={assistantInitialPrompt}
        onAssistantChange={applyAssistantChange}
        onAssistantSessionChange={setAssistantSessionId}
        onAssistantWorkingChange={setAssistantWorking}
        onChange={history.change}
        actions={actions}
      />
      {leaveGuardDialog}
      {undoConfirmDialog}
    </WorkspacePageShell>
  );
}
