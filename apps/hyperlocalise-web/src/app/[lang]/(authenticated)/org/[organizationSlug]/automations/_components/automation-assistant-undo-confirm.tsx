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
import { useState, type ReactNode } from "react";
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
import type { UndoStep } from "@/lib/undo-stack/undo-stack";

import { automationAssistantMessages as messages } from "./automation-assistant.messages";

/**
 * Asks before an undo that would take back a turn of the assistant's, since that is several
 * fields at once and anything typed since. Any other step is undone straight away.
 */
export function useAssistantUndoConfirm(onConfirm: () => void): {
  requestUndo: (step: UndoStep<unknown, unknown> | null) => void;
  undoConfirmDialog: ReactNode;
} {
  const [open, setOpen] = useState(false);

  const requestUndo = (step: UndoStep<unknown, unknown> | null) => {
    if (!step) {
      return;
    }
    if (step.origin === "assistant") {
      setOpen(true);
      return;
    }
    onConfirm();
  };

  const undoConfirmDialog = (
    <AlertDialog open={open} onOpenChange={setOpen}>
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
          <AlertDialogAction
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            <FormattedMessage {...messages.undoConfirm} />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { requestUndo, undoConfirmDialog };
}
