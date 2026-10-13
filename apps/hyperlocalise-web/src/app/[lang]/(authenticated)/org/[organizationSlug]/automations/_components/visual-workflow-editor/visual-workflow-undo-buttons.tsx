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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";
import type { UndoStep } from "@/lib/undo-stack/undo-stack";
import type {
  VisualWorkflowGraph,
  VisualWorkflowGraphChange,
} from "@/lib/visual-workflows/editor/visual-workflow-undo";

import { automationUndoMessages } from "../automation-undo.messages";
import { ShortcutKeys, useShortcutLabels } from "../automation-undo-controls";
import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";

export type VisualWorkflowUndoStep = UndoStep<VisualWorkflowGraph, VisualWorkflowGraphChange>;

/** What a step did, as the object of "Undo …" or "Redo …". */
function describeStep(intl: IntlShape, step: VisualWorkflowUndoStep): string {
  if (step.origin === "assistant") {
    return intl.formatMessage(messages.undoActionAssistant);
  }
  const { kind, nodeIds } = step.description;
  const count = nodeIds.length;
  switch (kind) {
    case "add":
      return intl.formatMessage(messages.undoActionAdd, { count });
    case "remove":
      return intl.formatMessage(messages.undoActionRemove, { count });
    case "connect":
      return intl.formatMessage(messages.undoActionConnect);
    case "disconnect":
      return intl.formatMessage(messages.undoActionDisconnect);
    case "move":
      return intl.formatMessage(messages.undoActionMove, { count });
    case "configure":
      return intl.formatMessage(messages.undoActionConfigure);
    case "retype":
      return intl.formatMessage(messages.undoActionRetype);
    case "rename":
      return intl.formatMessage(messages.undoActionRename);
    case "edit":
      return intl.formatMessage(messages.undoActionEdit);
    default:
      return assertNever(kind);
  }
}

/** One toast for every undo and redo, so a run of presses replaces it instead of stacking. */
const VISUAL_WORKFLOW_UNDO_TOAST_ID = "visual-workflow-undo";

/** Names an undo or a redo of a step, and raises the notice for one the page does not show. */
export function useVisualWorkflowUndoNotice() {
  const intl = useIntl();
  const { undoText, redoText } = useShortcutLabels();
  const undoTitle = (step: VisualWorkflowUndoStep) =>
    intl.formatMessage(messages.undoTooltip, { action: describeStep(intl, step) });
  const redoTitle = (step: VisualWorkflowUndoStep) =>
    intl.formatMessage(messages.redoTooltip, { action: describeStep(intl, step) });

  return {
    undoTitle,
    redoTitle,
    notifyUndo: (step: VisualWorkflowUndoStep, redo: () => void) => {
      toast.message(undoTitle(step), {
        id: VISUAL_WORKFLOW_UNDO_TOAST_ID,
        description: intl.formatMessage(automationUndoMessages.redoHint, { shortcut: redoText }),
        action: { label: intl.formatMessage(automationUndoMessages.redo), onClick: redo },
      });
    },
    notifyRedo: (step: VisualWorkflowUndoStep, undo: () => void) => {
      toast.message(redoTitle(step), {
        id: VISUAL_WORKFLOW_UNDO_TOAST_ID,
        description: intl.formatMessage(automationUndoMessages.undoHint, { shortcut: undoText }),
        action: { label: intl.formatMessage(automationUndoMessages.undo), onClick: undo },
      });
    },
    /** Takes down a notice about an earlier step, whose way back no longer applies. */
    dismiss: () => toast.dismiss(VISUAL_WORKFLOW_UNDO_TOAST_ID),
  };
}

/** Undo and redo buttons for the visual editor's header, named after the step they apply. */
export function VisualWorkflowUndoRedoButtons({
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
  undoStep: VisualWorkflowUndoStep | null;
  redoStep: VisualWorkflowUndoStep | null;
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
              size="icon-sm"
              aria-label={intl.formatMessage(automationUndoMessages.undo)}
              disabled={disabled || !canUndo}
              onClick={onUndo}
            >
              <ArrowUUpLeftIcon />
            </Button>
          }
        />
        <TooltipContent side="bottom">
          {undoStep
            ? intl.formatMessage(messages.undoTooltip, { action: describeStep(intl, undoStep) })
            : intl.formatMessage(messages.undoNothing)}
          <ShortcutKeys keys={undoKeys} />
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={intl.formatMessage(automationUndoMessages.redo)}
              disabled={disabled || !canRedo}
              onClick={onRedo}
            >
              <ArrowUUpRightIcon />
            </Button>
          }
        />
        <TooltipContent side="bottom">
          {redoStep
            ? intl.formatMessage(messages.redoTooltip, { action: describeStep(intl, redoStep) })
            : intl.formatMessage(messages.redoNothing)}
          <ShortcutKeys keys={redoKeys} />
        </TooltipContent>
      </Tooltip>
    </>
  );
}
