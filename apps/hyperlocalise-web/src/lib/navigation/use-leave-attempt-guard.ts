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
import { useEffect, useEffectEvent, useRef } from "react";

import { stripAppLocalePrefix } from "@/components/app-shell/navigation-config";
import { registerLeaveGuard, type GuardedNavigation } from "@/lib/navigation/leave-guard";
import { useOrgRouter } from "@/lib/navigation/use-org-router";

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

/** The address of the history entry after the current one, in browsers that can tell. */
function forwardEntryHref(): string | null {
  const navigation = window.navigation;
  const index = navigation?.currentEntry?.index;
  if (!navigation || index === undefined || index < 0) {
    return null;
  }
  return navigation.entries()[index + 1]?.url ?? null;
}

/**
 * Tells the page when the person tries to leave it while `active`: on an in-app link, on
 * navigation through `useOrgRouter` (a breadcrumb menu, say) and on the browser's back button.
 * `onLeaveAttempt` gets `proceed`, which carries the leave out; not calling it keeps the person
 * on the page. Reload and close get the browser's own warning. `leaveTo` is for navigation the
 * page does itself once the changes are saved or thrown away, which is not reported.
 */
export function useLeaveAttemptGuard(
  active: boolean,
  onLeaveAttempt: (proceed: () => void) => void,
): { leaveTo: (href: string) => void } {
  const router = useOrgRouter();
  // Set once the person has chosen to leave, so the leaving itself is not questioned.
  const leaving = useRef(false);
  // An extra history entry for this page, so the back button lands here first and can be asked about.
  const historyGuardPushed = useRef(false);
  // Set while the extra entry is being taken away, which the browser does a moment later. Holds
  // the address the extra entry had: the page may have rewritten it there (a section or tab in
  // the query, say), and the entry underneath still has the address from before.
  const removingHistoryGuard = useRef<string | null>(null);

  const pushHistoryGuard = (href = window.location.href) => {
    // While the old entry is still on its way out, a new one waits for `onPopState`.
    if (historyGuardPushed.current || removingHistoryGuard.current !== null) {
      return;
    }
    window.history.pushState({ unsavedChangesLeaveGuard: true }, "", href);
    historyGuardPushed.current = true;
  };

  const requestLeave = (proceed: () => void) => {
    onLeaveAttempt(() => {
      leaving.current = true;
      proceed();
    });
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

  // Every `useOrgRouter` navigation comes through here while the guard is active.
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
    const hrefToKeep = removingHistoryGuard.current;
    if (hrefToKeep !== null) {
      removingHistoryGuard.current = null;
      if (window.location.href !== hrefToKeep) {
        window.history.replaceState(null, "", hrefToKeep);
      }
      // The guard came back on before the extra entry was gone, so it is needed again.
      if (active) {
        pushHistoryGuard();
      }
      return;
    }
    if (!active) {
      return;
    }
    historyGuardPushed.current = false;
    if (leaving.current) {
      return;
    }
    // The back button took the extra entry. It is put back at once, so pressing back again
    // before the page has answered cannot leave either, and with the address it had, which is
    // the one of the entry just left.
    const leftHref = forwardEntryHref();
    pushHistoryGuard(
      leftHref !== null && staysOnCurrentPage(leftHref, window.location.href)
        ? leftHref
        : undefined,
    );
    requestLeave(() => {
      historyGuardPushed.current = false;
      // One step for the extra entry, one for this page.
      window.history.go(-2);
    });
  });

  useEffect(() => {
    if (!active) {
      // Nothing left to protect, so the extra entry goes and the back button works as usual.
      if (historyGuardPushed.current && !leaving.current) {
        historyGuardPushed.current = false;
        removingHistoryGuard.current = window.location.href;
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
  }, [active]);

  // Listens the whole time, because the step back that removes the extra entry arrives after
  // the guard is off.
  useEffect(() => {
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const leaveTo = (href: string) => {
    leaving.current = true;
    router.push(href);
  };

  return { leaveTo };
}
