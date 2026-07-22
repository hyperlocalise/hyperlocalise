/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { REQUEST_URL_HEADER } from "@/lib/workos/request-url-header";

const { workosWithAuthMock, resolveFixtureAuthSessionMock, headersMock, redirectMock } = vi.hoisted(
  () => ({
    workosWithAuthMock: vi.fn(),
    resolveFixtureAuthSessionMock: vi.fn(),
    headersMock: vi.fn(),
    redirectMock: vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    }),
  }),
);

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: workosWithAuthMock,
}));

vi.mock("@/lib/e2e/fixture-auth", () => ({
  resolveFixtureAuthSession: resolveFixtureAuthSessionMock,
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

describe("withAuth", () => {
  beforeEach(() => {
    workosWithAuthMock.mockReset();
    resolveFixtureAuthSessionMock.mockReset();
    headersMock.mockReset();
    redirectMock.mockClear();
    resolveFixtureAuthSessionMock.mockResolvedValue(null);
    headersMock.mockResolvedValue(
      new Headers({
        [REQUEST_URL_HEADER]: "http://localhost:3000/en-US/org/acme/projects/proj_1",
      }),
    );
  });

  it("does not pass ensureSignedIn to WorkOS withAuth", async () => {
    workosWithAuthMock.mockResolvedValue({
      user: { id: "user_1", email: "a@example.com" },
    });

    const { withAuth } = await import("./server-auth");
    await withAuth({ ensureSignedIn: true });

    expect(workosWithAuthMock).toHaveBeenCalledWith();
  });

  it("redirects expired sessions through /auth/sign-in instead of setting PKCE cookies", async () => {
    workosWithAuthMock.mockResolvedValue({ user: null });

    const { withAuth } = await import("./server-auth");

    await expect(withAuth({ ensureSignedIn: true })).rejects.toThrow(
      "redirect:/auth/sign-in?returnTo=%2Fen-US%2Forg%2Facme%2Fprojects%2Fproj_1",
    );
    expect(workosWithAuthMock).toHaveBeenCalledWith();
    expect(redirectMock).toHaveBeenCalledWith(
      "/auth/sign-in?returnTo=%2Fen-US%2Forg%2Facme%2Fprojects%2Fproj_1",
    );
  });

  it("falls back to /dashboard when the request URL header is missing", async () => {
    workosWithAuthMock.mockResolvedValue({ user: null });
    headersMock.mockResolvedValue(new Headers());

    const { withAuth } = await import("./server-auth");

    await expect(withAuth({ ensureSignedIn: true })).rejects.toThrow(
      "redirect:/auth/sign-in?returnTo=%2Fdashboard",
    );
  });

  it("returns null user without redirecting when ensureSignedIn is false", async () => {
    workosWithAuthMock.mockResolvedValue({ user: null });

    const { withAuth } = await import("./server-auth");
    await expect(withAuth()).resolves.toEqual({ user: null });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
