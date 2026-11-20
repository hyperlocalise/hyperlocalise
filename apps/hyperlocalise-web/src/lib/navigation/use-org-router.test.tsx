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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { registerLeaveGuard } from "./leave-guard";
import { useOrgRouter } from "./use-org-router";

const mocks = vi.hoisted(() => ({
  pathname: "/fr-FR/org/acme/projects",
  push: vi.fn(),
  replace: vi.fn(),
}));

// Only the React build that Next bundles has this; the one the tests run on does not.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  addTransitionType: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

describe("useOrgRouter", () => {
  beforeEach(() => {
    mocks.pathname = "/fr-FR/org/acme/projects";
    mocks.push.mockReset();
    mocks.replace.mockReset();
  });

  it("navigates to org pages in the current page's locale", () => {
    const { result } = renderHook(() => useOrgRouter());

    result.current.push("/org/acme/projects/proj_1");
    result.current.replace("/org/acme/projects/proj_1?tab=jobs");

    expect(mocks.push).toHaveBeenCalledWith("/fr-FR/org/acme/projects/proj_1", {
      scroll: undefined,
    });
    expect(mocks.replace).toHaveBeenCalledWith("/fr-FR/org/acme/projects/proj_1?tab=jobs", {
      scroll: undefined,
    });
  });

  it("hands the page's leave guard the localized href", () => {
    const guard = vi.fn();
    const unregister = registerLeaveGuard(guard);
    const { result } = renderHook(() => useOrgRouter());

    result.current.push("/org/acme/inbox");
    unregister();

    expect(guard).toHaveBeenCalledWith("/fr-FR/org/acme/inbox", expect.any(Function));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("leaves hrefs alone on a page without a locale", () => {
    mocks.pathname = "/org/acme/projects";
    const { result } = renderHook(() => useOrgRouter());

    result.current.push("/org/acme/inbox");

    expect(mocks.push).toHaveBeenCalledWith("/org/acme/inbox", { scroll: undefined });
  });
});
