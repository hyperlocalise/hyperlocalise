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
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
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

import { issueDetailPanelMessages as messages } from "./issue-detail-panel.messages";
import type { IssueDetailPanelHandle } from "./issue-detail-panel";

type IssueDetailLeaveGuardContextValue = {
  requestNavigate: (href: string) => void;
};

const IssueDetailLeaveGuardContext = createContext<IssueDetailLeaveGuardContextValue | null>(null);

/** Navigate in-app, prompting when the issue detail draft is dirty. */
export function useIssueDetailGuardedNavigate() {
  const router = useRouter();
  const guard = useContext(IssueDetailLeaveGuardContext);

  return useCallback(
    (href: string) => {
      if (guard) {
        guard.requestNavigate(href);
        return;
      }
      router.push(href);
    },
    [guard, router],
  );
}

export function getInternalNavigationHrefFromClick(
  target: EventTarget | null,
  currentHref: string,
): string | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) {
    return null;
  }

  if (anchor.target === "_blank" || anchor.hasAttribute("download")) {
    return null;
  }

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return null;
  }

  try {
    const url = new URL(href, currentHref);
    if (url.origin !== new URL(currentHref).origin) {
      return null;
    }

    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = new URL(currentHref);
    const currentPath = `${current.pathname}${current.search}${current.hash}`;
    if (next === currentPath) {
      return null;
    }

    return next;
  } catch {
    return null;
  }
}

export function IssueDetailNavigationGuard({
  panelRef,
  isDirty,
  children,
}: {
  panelRef: RefObject<IssueDetailPanelHandle | null>;
  isDirty: boolean;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSavingClose, setIsSavingClose] = useState(false);
  const pendingProceedRef = useRef<(() => void) | null>(null);
  const historyGuardPushedRef = useRef(false);
  const leavingRef = useRef(false);

  const clearPendingProceed = useCallback(() => {
    pendingProceedRef.current = null;
  }, []);

  const keepEditing = useCallback(() => {
    leavingRef.current = false;
    setConfirmOpen(false);
    setIsSavingClose(false);
    clearPendingProceed();
    panelRef.current?.endCloseConfirm();
    if (panelRef.current?.isDirty() && !historyGuardPushedRef.current) {
      window.history.pushState({ issueDetailDraftGuard: true }, "", window.location.href);
      historyGuardPushedRef.current = true;
    }
  }, [clearPendingProceed, panelRef]);

  const runPendingProceed = useCallback(() => {
    leavingRef.current = true;
    const proceed = pendingProceedRef.current;
    pendingProceedRef.current = null;
    setConfirmOpen(false);
    setIsSavingClose(false);
    proceed?.();
  }, []);

  const requestLeave = useCallback(
    (proceed: () => void) => {
      const panel = panelRef.current;
      if (!panel) {
        leavingRef.current = true;
        proceed();
        return;
      }

      panel.beginCloseConfirm();
      if (panel.isDirty()) {
        pendingProceedRef.current = proceed;
        setConfirmOpen(true);
        return;
      }

      leavingRef.current = true;
      proceed();
    },
    [panelRef],
  );

  const requestNavigate = useCallback(
    (href: string) => {
      requestLeave(() => {
        router.push(href);
      });
    },
    [requestLeave, router],
  );

  const leaveGuardValue = useMemo(
    () => ({
      requestNavigate,
    }),
    [requestNavigate],
  );

  const handleDiscard = useCallback(() => {
    panelRef.current?.discardPending();
    runPendingProceed();
  }, [panelRef, runPendingProceed]);

  const handleSaveAndLeave = useCallback(async () => {
    setIsSavingClose(true);
    try {
      await panelRef.current?.savePending();
      runPendingProceed();
    } catch {
      setIsSavingClose(false);
      panelRef.current?.endCloseConfirm();
    }
  }, [panelRef, runPendingProceed]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leavingRef.current || !panelRef.current?.isDirty()) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [panelRef]);

  useEffect(() => {
    const onClickCapture = (event: MouseEvent) => {
      if (leavingRef.current || event.defaultPrevented) {
        return;
      }
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const href = getInternalNavigationHrefFromClick(event.target, window.location.href);
      if (!href) {
        return;
      }

      if (!panelRef.current?.isDirty()) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      requestNavigate(href);
    };

    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [panelRef, requestNavigate]);

  useEffect(() => {
    if (!isDirty) {
      if (historyGuardPushedRef.current) {
        historyGuardPushedRef.current = false;
        window.history.back();
      }
      return;
    }

    if (!historyGuardPushedRef.current) {
      window.history.pushState({ issueDetailDraftGuard: true }, "", window.location.href);
      historyGuardPushedRef.current = true;
    }

    const onPopState = () => {
      if (leavingRef.current || !panelRef.current?.isDirty()) {
        historyGuardPushedRef.current = false;
        return;
      }

      historyGuardPushedRef.current = false;
      requestLeave(() => {
        historyGuardPushedRef.current = false;
        window.history.back();
      });
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isDirty, panelRef, requestLeave]);

  return (
    <IssueDetailLeaveGuardContext.Provider value={leaveGuardValue}>
      {children}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (isSavingClose) {
            return;
          }
          if (!open) {
            keepEditing();
            return;
          }
          setConfirmOpen(true);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...messages.unsavedChangesTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage {...messages.unsavedChangesDescription} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSavingClose} onClick={keepEditing}>
              <FormattedMessage {...messages.unsavedChangesKeepEditing} />
            </AlertDialogCancel>
            <Button
              variant="outline"
              disabled={isSavingClose}
              onPointerDown={() => panelRef.current?.beginCloseConfirm()}
              onClick={handleDiscard}
            >
              <FormattedMessage {...messages.unsavedChangesDiscard} />
            </Button>
            <Button
              disabled={isSavingClose}
              onPointerDown={() => panelRef.current?.beginCloseConfirm()}
              onClick={() => void handleSaveAndLeave()}
            >
              <FormattedMessage {...messages.unsavedChangesSave} />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </IssueDetailLeaveGuardContext.Provider>
  );
}
