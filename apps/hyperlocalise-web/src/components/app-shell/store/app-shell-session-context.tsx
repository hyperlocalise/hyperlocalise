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
import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { InboxCurrentUser } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/inbox/_components/inbox-types";

export type AppShellSession = {
  canDeleteQueries: boolean;
  currentUser: InboxCurrentUser;
};

const AppShellSessionContext = createContext<AppShellSession | null>(null);

export function AppShellSessionProvider({
  canDeleteQueries,
  children,
  currentUser,
}: AppShellSession & { children: ReactNode }) {
  const session = useMemo(
    () => ({ canDeleteQueries, currentUser }),
    [canDeleteQueries, currentUser],
  );

  return (
    <AppShellSessionContext.Provider value={session}>{children}</AppShellSessionContext.Provider>
  );
}

export function useAppShellSession() {
  const session = useContext(AppShellSessionContext);
  if (!session) {
    throw new Error("useAppShellSession must be used within AppShellSessionProvider");
  }

  return session;
}

export function useOptionalAppShellSession() {
  return useContext(AppShellSessionContext);
}
