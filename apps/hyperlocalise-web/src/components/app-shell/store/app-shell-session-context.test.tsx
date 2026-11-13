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
// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vite-plus/test";

import {
  AppShellSessionProvider,
  useAppShellSession,
  useOptionalAppShellSession,
} from "./app-shell-session-context";

const currentUser = {
  avatarUrl: null,
  email: "ava@example.com",
  name: "Ava Example",
};

function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <AppShellSessionProvider canDeleteQueries currentUser={currentUser}>
      {children}
    </AppShellSessionProvider>
  );
}

describe("useAppShellSession", () => {
  it("exposes the current user and delete-query capability", () => {
    const { result } = renderHook(() => useAppShellSession(), { wrapper: SessionProvider });

    expect(result.current).toEqual({
      canDeleteQueries: true,
      currentUser,
    });
  });

  it("returns null outside the provider", () => {
    const { result } = renderHook(() => useOptionalAppShellSession());

    expect(result.current).toBeNull();
  });
});
