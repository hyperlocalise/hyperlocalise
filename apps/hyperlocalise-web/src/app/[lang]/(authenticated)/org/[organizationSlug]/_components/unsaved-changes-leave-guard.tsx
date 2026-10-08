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
import { useRef, useState, type ReactNode } from "react";
import { FormattedMessage } from "react-intl";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useLeaveAttemptGuard } from "@/lib/navigation/use-leave-attempt-guard";

import { unsavedChangesLeaveGuardMessages } from "./unsaved-changes-leave-guard.messages";

/**
 * Asks before the person leaves a page whose changes are not saved: on an in-app link, on
 * navigation through `useOrgRouter` (a breadcrumb menu, say), on the browser's back button, and
 * on reload or close. `leaveTo` is for navigation the page does itself once the changes are saved
 * or thrown away, which must not ask.
 */
export function useUnsavedChangesLeaveGuard(hasUnsavedChanges: boolean): {
  leaveGuardDialog: ReactNode;
  leaveTo: (href: string) => void;
} {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingLeave = useRef<(() => void) | null>(null);

  const { leaveTo } = useLeaveAttemptGuard(hasUnsavedChanges, (proceed) => {
    pendingLeave.current = proceed;
    setConfirmOpen(true);
  });

  const keepEditing = () => {
    pendingLeave.current = null;
    setConfirmOpen(false);
  };

  const leave = () => {
    const proceed = pendingLeave.current;
    pendingLeave.current = null;
    setConfirmOpen(false);
    proceed?.();
  };

  const leaveGuardDialog = (
    <AlertDialog
      open={confirmOpen}
      onOpenChange={(open) => {
        if (!open) {
          keepEditing();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <FormattedMessage {...unsavedChangesLeaveGuardMessages.title} />
          </AlertDialogTitle>
          <AlertDialogDescription>
            <FormattedMessage {...unsavedChangesLeaveGuardMessages.description} />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={keepEditing}>
            <FormattedMessage {...unsavedChangesLeaveGuardMessages.keepEditing} />
          </AlertDialogCancel>
          <Button variant="destructive" onClick={leave}>
            <FormattedMessage {...unsavedChangesLeaveGuardMessages.leave} />
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { leaveGuardDialog, leaveTo };
}
