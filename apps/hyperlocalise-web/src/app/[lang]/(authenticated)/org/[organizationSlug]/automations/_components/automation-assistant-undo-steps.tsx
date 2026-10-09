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
import { useState, type ReactNode, type RefObject } from "react";
import { FormattedMessage } from "react-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { UndoOrigin, UndoStep } from "@/lib/undo-stack/undo-stack";

import { automationAssistantMessages as messages } from "./automation-assistant.messages";

/** What this needs of a page's undo history. */
type AssistantUndoHistory<TForm> = {
  undoStep: UndoStep<unknown, unknown> | null;
  seal: () => void;
  change: (next: TForm, meta?: { origin?: UndoOrigin }) => void;
};

/**
 * How a page with an undo history takes the assistant's changes and gives them back.
 *
 * A change of the assistant's becomes one step, kept apart from the typing around it. Undoing
 * such a step asks first, since it is several fields at once and anything typed since; any other
 * step is undone straight away. The history is read through a ref, because undo also runs from a
 * notice shown renders ago.
 */
export function useAssistantUndoSteps<TForm>(
  history: RefObject<AssistantUndoHistory<TForm>>,
  onUndo: () => void,
): {
  runUndo: () => void;
  applyAssistantChange: (next: TForm) => void;
  undoConfirmDialog: ReactNode;
} {
  // The step the dialog asks about, by id: another change can land while it is open, and the
  // answer is to the step that was asked about, not to whatever is on top by then.
  const [asking, setAsking] = useState<number | null>(null);

  const runUndo = () => {
    const step = history.current.undoStep;
    if (!step) {
      return;
    }
    if (step.origin === "assistant") {
      setAsking(step.id);
      return;
    }
    onUndo();
  };

  const confirmUndo = () => {
    const step = history.current.undoStep;
    setAsking(null);
    if (step && step.id === asking) {
      onUndo();
    }
  };

  const applyAssistantChange = (next: TForm) => {
    history.current.seal();
    history.current.change(next, { origin: "assistant" });
    history.current.seal();
  };

  const undoConfirmDialog = (
    <AlertDialog
      open={asking !== null}
      onOpenChange={(open) => {
        if (!open) {
          setAsking(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <FormattedMessage {...messages.undoTitle} />
          </AlertDialogTitle>
          <AlertDialogDescription>
            <FormattedMessage {...messages.undoDescription} />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <FormattedMessage {...messages.undoCancel} />
          </AlertDialogCancel>
          <AlertDialogAction onClick={confirmUndo}>
            <FormattedMessage {...messages.undoConfirm} />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { runUndo, applyAssistantChange, undoConfirmDialog };
}
