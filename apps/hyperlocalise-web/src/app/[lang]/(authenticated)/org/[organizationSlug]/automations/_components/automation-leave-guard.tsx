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
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { FormattedMessage } from "react-intl";

import { getInternalNavigationHrefFromClick } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_components/issue-detail/issue-detail-navigation-guard";
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
import { useOrgRouter } from "@/lib/navigation/use-org-router";

import { automationLeaveGuardMessages } from "./automation-leave-guard.messages";

/**
 * Asks before the person leaves a setup page whose changes are not saved: on an in-app link, on
 * the browser's back button, and on reload or close. `leaveTo` is for navigation the page does
 * itself once the changes are saved or thrown away, which must not ask.
 */
export function useAutomationLeaveGuard(hasUnsavedChanges: boolean): {
  leaveGuardDialog: ReactNode;
  leaveTo: (href: string) => void;
} {
  const router = useOrgRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingLeave = useRef<(() => void) | null>(null);
  // Set once the person has chosen to leave, so the leaving itself is not questioned.
  const leaving = useRef(false);
  // An extra history entry for this page, so the back button lands here first and can be asked about.
  const historyGuardPushed = useRef(false);

  const navigate = (href: string) => {
    // Replacing drops the extra entry, so going back later does not show this page twice.
    if (historyGuardPushed.current) {
      historyGuardPushed.current = false;
      router.replace(href);
      return;
    }
    router.push(href);
  };

  const pushHistoryGuard = () => {
    if (!historyGuardPushed.current) {
      window.history.pushState({ automationLeaveGuard: true }, "", window.location.href);
      historyGuardPushed.current = true;
    }
  };

  const requestLeave = (proceed: () => void) => {
    pendingLeave.current = proceed;
    setConfirmOpen(true);
  };

  const keepEditing = () => {
    pendingLeave.current = null;
    setConfirmOpen(false);
    // The back button already took the extra entry, so it is put back.
    if (hasUnsavedChanges) {
      pushHistoryGuard();
    }
  };

  const leave = () => {
    const proceed = pendingLeave.current;
    pendingLeave.current = null;
    leaving.current = true;
    setConfirmOpen(false);
    proceed?.();
  };

  const onBeforeUnload = useEffectEvent((event: BeforeUnloadEvent) => {
    if (leaving.current) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });

  const onClickCapture = useEffectEvent((event: MouseEvent) => {
    if (leaving.current || event.defaultPrevented) {
      return;
    }
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const href = getInternalNavigationHrefFromClick(event.target, window.location.href);
    if (!href) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    requestLeave(() => navigate(href));
  });

  const onPopState = useEffectEvent(() => {
    historyGuardPushed.current = false;
    if (leaving.current) {
      return;
    }
    requestLeave(() => window.history.back());
  });

  useEffect(() => {
    if (!hasUnsavedChanges) {
      // Nothing left to protect, so the extra entry goes and the back button works as usual.
      if (historyGuardPushed.current && !leaving.current) {
        historyGuardPushed.current = false;
        window.history.back();
      }
      return;
    }

    pushHistoryGuard();
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [hasUnsavedChanges]);

  const leaveTo = (href: string) => {
    leaving.current = true;
    navigate(href);
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
            <FormattedMessage {...automationLeaveGuardMessages.title} />
          </AlertDialogTitle>
          <AlertDialogDescription>
            <FormattedMessage {...automationLeaveGuardMessages.description} />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={keepEditing}>
            <FormattedMessage {...automationLeaveGuardMessages.keepEditing} />
          </AlertDialogCancel>
          <Button variant="destructive" onClick={leave}>
            <FormattedMessage {...automationLeaveGuardMessages.leave} />
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { leaveGuardDialog, leaveTo };
}
