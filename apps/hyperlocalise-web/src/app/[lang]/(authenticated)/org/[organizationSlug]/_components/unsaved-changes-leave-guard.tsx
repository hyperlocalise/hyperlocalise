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

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { stripAppLocalePrefix } from "@/components/app-shell/navigation-config";
import { Button } from "@/components/ui/button";
import { registerLeaveGuard, type GuardedNavigation } from "@/lib/navigation/leave-guard";
import { useOrgRouter } from "@/lib/navigation/use-org-router";

import { unsavedChangesLeaveGuardMessages } from "./unsaved-changes-leave-guard.messages";

/** The in-app path a click on a link would go to, or null when the click does not leave the page. */
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

/** Whether `href` is this same page with another query or hash, which keeps the page and its form. */
function staysOnCurrentPage(href: string, currentHref: string): boolean {
  try {
    const target = new URL(href, currentHref);
    const current = new URL(currentHref);
    return (
      target.origin === current.origin &&
      stripAppLocalePrefix(target.pathname) === stripAppLocalePrefix(current.pathname)
    );
  } catch {
    return false;
  }
}

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
  const router = useOrgRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingLeave = useRef<(() => void) | null>(null);
  // Set once the person has chosen to leave, so the leaving itself is not questioned.
  const leaving = useRef(false);
  // An extra history entry for this page, so the back button lands here first and can be asked about.
  const historyGuardPushed = useRef(false);
  // Set while the extra entry is being taken away, which the browser does a moment later.
  const removingHistoryGuard = useRef(false);

  const pushHistoryGuard = () => {
    // While the old entry is still on its way out, a new one waits for `onPopState`.
    if (historyGuardPushed.current || removingHistoryGuard.current) {
      return;
    }
    window.history.pushState({ unsavedChangesLeaveGuard: true }, "", window.location.href);
    historyGuardPushed.current = true;
  };

  const requestLeave = (proceed: () => void) => {
    pendingLeave.current = proceed;
    setConfirmOpen(true);
  };

  const keepEditing = () => {
    pendingLeave.current = null;
    setConfirmOpen(false);
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
    requestLeave(() => router.push(href));
  });

  // Every `useOrgRouter` navigation comes through here while the changes are unsaved.
  const onGuardedNavigation = useEffectEvent((href: string, proceed: GuardedNavigation) => {
    if (!leaving.current && staysOnCurrentPage(href, window.location.href)) {
      // Nothing is lost, so nothing is asked. The extra entry is replaced and stays the newest
      // one, so the back button is still caught.
      proceed({ replace: historyGuardPushed.current });
      return;
    }
    const go = () => {
      // Replacing drops the extra entry, so going back later does not show this page twice.
      const replace = historyGuardPushed.current;
      historyGuardPushed.current = false;
      proceed({ replace });
    };
    if (leaving.current) {
      go();
      return;
    }
    requestLeave(go);
  });

  const onPopState = useEffectEvent(() => {
    if (removingHistoryGuard.current) {
      removingHistoryGuard.current = false;
      // The changes came back before the extra entry was gone, so it is needed again.
      if (hasUnsavedChanges) {
        pushHistoryGuard();
      }
      return;
    }
    if (!hasUnsavedChanges) {
      return;
    }
    historyGuardPushed.current = false;
    if (leaving.current) {
      return;
    }
    // The back button took the extra entry. It is put back at once, so pressing back again
    // while the question is open cannot leave either.
    pushHistoryGuard();
    requestLeave(() => {
      historyGuardPushed.current = false;
      // One step for the extra entry, one for this page.
      window.history.go(-2);
    });
  });

  useEffect(() => {
    if (!hasUnsavedChanges) {
      // Nothing left to protect, so the extra entry goes and the back button works as usual.
      if (historyGuardPushed.current && !leaving.current) {
        historyGuardPushed.current = false;
        removingHistoryGuard.current = true;
        window.history.back();
      }
      return;
    }

    pushHistoryGuard();
    const unregisterLeaveGuard = registerLeaveGuard((href, proceed) =>
      onGuardedNavigation(href, proceed),
    );
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      unregisterLeaveGuard();
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [hasUnsavedChanges]);

  // Listens the whole time, because the step back that removes the extra entry arrives after
  // the changes are gone.
  useEffect(() => {
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const leaveTo = (href: string) => {
    leaving.current = true;
    router.push(href);
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
