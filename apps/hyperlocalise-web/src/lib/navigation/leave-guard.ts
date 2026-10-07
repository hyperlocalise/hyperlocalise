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

/** Carries out a navigation that was held back; `replace` is set when it must not add a history entry. */
export type GuardedNavigation = (how: { replace: boolean }) => void;

type LeaveGuard = (href: string, proceed: GuardedNavigation) => void;

let activeLeaveGuard: LeaveGuard | null = null;

/** Lets `guard` decide whether in-app navigation goes ahead, until the returned function is called. */
export function registerLeaveGuard(guard: LeaveGuard): () => void {
  activeLeaveGuard = guard;
  return () => {
    if (activeLeaveGuard === guard) {
      activeLeaveGuard = null;
    }
  };
}

/** Runs `proceed` at once, or hands it to the page's leave guard when one is registered. */
export function navigateThroughLeaveGuard(href: string, proceed: GuardedNavigation) {
  if (activeLeaveGuard) {
    activeLeaveGuard(href, proceed);
    return;
  }
  proceed({ replace: false });
}
