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
import { ArrowUUpLeftIcon, ArrowUUpRightIcon } from "@phosphor-icons/react";
import { useIntl, type IntlShape } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getModKeyLabel } from "@/components/content-editor/editor/content-editor-keyboard-shortcuts";
import { useIsMac } from "@/hooks/use-is-mac";
import type {
  WorkspaceAutomationChangeGroup,
  WorkspaceAutomationFormChange,
} from "@/lib/agents/workspace-automation-undo";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";
import type { UndoStep } from "@/lib/undo-stack/undo-stack";

import { automationUndoMessages } from "./automation-undo.messages";

export type AutomationUndoStep = UndoStep<
  WorkspaceAutomationFormState | null,
  WorkspaceAutomationFormChange | null
>;

/** One toast for every undo and redo, so a run of presses replaces it instead of stacking. */
export const AUTOMATION_UNDO_TOAST_ID = "automation-undo";

const GROUP_MESSAGES: Record<WorkspaceAutomationChangeGroup, keyof typeof automationUndoMessages> =
  {
    name: "changeName",
    instructions: "changeInstructions",
    status: "changeStatus",
    model: "changeModel",
    project: "changeProject",
    trigger: "changeTrigger",
    schedule: "changeSchedule",
    skills: "changeSkills",
    tools: "changeTools",
    sync: "changeSync",
    settings: "changeSettings",
  };

/** Names what a step changed, in words that follow "Undo" or "Undid". */
export function formatWorkspaceAutomationChange(
  intl: IntlShape,
  change: WorkspaceAutomationFormChange | null | undefined,
): string {
  switch (change?.kind) {
    case "edit":
      return intl.formatMessage(automationUndoMessages[GROUP_MESSAGES[change.group]]);
    case "discard":
      return intl.formatMessage(automationUndoMessages.changeDiscard);
    case "reload":
      return intl.formatMessage(automationUndoMessages.changeReload);
    case "assistant":
      return intl.formatMessage(automationUndoMessages.changeAssistant);
    default:
      return intl.formatMessage(automationUndoMessages.changeUnknown);
  }
}

function useShortcutLabels() {
  const isMac = useIsMac();
  const mod = getModKeyLabel(isMac);
  return {
    undoKeys: [mod, "Z"],
    redoKeys: isMac ? [mod, "⇧", "Z"] : [mod, "Shift", "Z"],
    undoText: isMac ? `${mod}Z` : `${mod}+Z`,
    redoText: isMac ? `${mod}⇧Z` : `${mod}+Shift+Z`,
  };
}

function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <KbdGroup aria-hidden="true" className="ms-2">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </KbdGroup>
  );
}

/** Undo and redo buttons for the automation page's header, named after the step they apply. */
export function AutomationUndoRedoButtons({
  canUndo,
  canRedo,
  undoStep,
  redoStep,
  disabled = false,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  undoStep: AutomationUndoStep | null;
  redoStep: AutomationUndoStep | null;
  disabled?: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const intl = useIntl();
  const { undoKeys, redoKeys } = useShortcutLabels();

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              aria-label={intl.formatMessage(automationUndoMessages.undo)}
              disabled={disabled || !canUndo}
              onClick={onUndo}
            >
              <ArrowUUpLeftIcon />
            </Button>
          }
        />
        <TooltipContent side="bottom">
          {intl.formatMessage(automationUndoMessages.undoWithChange, {
            change: formatWorkspaceAutomationChange(intl, undoStep?.description),
          })}
          <ShortcutKeys keys={undoKeys} />
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              aria-label={intl.formatMessage(automationUndoMessages.redo)}
              disabled={disabled || !canRedo}
              onClick={onRedo}
            >
              <ArrowUUpRightIcon />
            </Button>
          }
        />
        <TooltipContent side="bottom">
          {intl.formatMessage(automationUndoMessages.redoWithChange, {
            change: formatWorkspaceAutomationChange(intl, redoStep?.description),
          })}
          <ShortcutKeys keys={redoKeys} />
        </TooltipContent>
      </Tooltip>
    </>
  );
}

/** Raises the notice that follows an undo or a redo, with the way back on it. */
export function useAutomationUndoNotice() {
  const intl = useIntl();
  const { undoText, redoText } = useShortcutLabels();

  return {
    notifyUndo: (step: AutomationUndoStep, redo: () => void) => {
      toast.message(
        intl.formatMessage(automationUndoMessages.undone, {
          change: formatWorkspaceAutomationChange(intl, step.description),
        }),
        {
          id: AUTOMATION_UNDO_TOAST_ID,
          description: intl.formatMessage(automationUndoMessages.redoHint, { shortcut: redoText }),
          action: { label: intl.formatMessage(automationUndoMessages.redo), onClick: redo },
        },
      );
    },
    notifyRedo: (step: AutomationUndoStep, undo: () => void) => {
      toast.message(
        intl.formatMessage(automationUndoMessages.redone, {
          change: formatWorkspaceAutomationChange(intl, step.description),
        }),
        {
          id: AUTOMATION_UNDO_TOAST_ID,
          description: intl.formatMessage(automationUndoMessages.undoHint, { shortcut: undoText }),
          action: { label: intl.formatMessage(automationUndoMessages.undo), onClick: undo },
        },
      );
    },
  };
}
