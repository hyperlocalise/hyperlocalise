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

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { IssueListUrlState } from "./issue-list-url-state";
import { useIssueDetailUrl } from "./use-issue-detail-url";

const navigationMock = vi.hoisted(() => ({
  pathname: "/en-US/org/acme/issues",
  router: {
    back: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
  useRouter: () => navigationMock.router,
}));

const DEFAULT_STATE = {
  view: "all_open",
  search: "",
  sort: "updated_at",
  sortDir: "desc",
} as const satisfies IssueListUrlState;

function expectSearchParams(href: string, expected: Record<string, string | undefined>) {
  const url = new URL(href, "https://hyperlocalise.test");
  for (const [key, value] of Object.entries(expected)) {
    expect(url.searchParams.get(key)).toBe(value ?? null);
  }
}

describe("useIssueDetailUrl", () => {
  beforeEach(() => {
    navigationMock.pathname = "/en-US/org/acme/issues";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("opens an issue detail route while preserving filters and project context", () => {
    const updateState = vi.fn();
    const { result } = renderHook(() =>
      useIssueDetailUrl({
        includeProject: true,
        state: {
          ...DEFAULT_STATE,
          issueType: "qa_failure",
          projectId: "project_website",
          search: "checkout copy",
          sort: "priority",
          sortDir: "asc",
          status: "open",
        },
        updateState,
      }),
    );

    act(() => {
      result.current.openIssueDetail({
        issueId: "11111111-1111-4111-8111-111111111111",
        projectId: "project_mobile",
      });
    });

    expect(navigationMock.router.push).toHaveBeenCalledTimes(1);
    const [href, options] = navigationMock.router.push.mock.calls[0]!;
    expect(new URL(href, "https://hyperlocalise.test").pathname).toBe("/en-US/org/acme/issues");
    expectSearchParams(href, {
      issue: "11111111-1111-4111-8111-111111111111",
      issueProject: "project_mobile",
      issueType: "qa_failure",
      projectId: "project_website",
      search: "checkout copy",
      sort: "priority",
      sortDir: "asc",
      status: "open",
    });
    expect(options).toEqual({ scroll: false });
    expect(updateState).not.toHaveBeenCalled();
  });

  it("closes with browser back when the detail view was opened in the current session", () => {
    const updateState = vi.fn();
    const { result } = renderHook(() =>
      useIssueDetailUrl({
        state: DEFAULT_STATE,
        updateState,
      }),
    );

    act(() => {
      result.current.openIssueDetail({ issueId: "22222222-2222-4222-8222-222222222222" });
      result.current.closeIssueDetail();
    });

    expect(navigationMock.router.back).toHaveBeenCalledTimes(1);
    expect(navigationMock.router.replace).not.toHaveBeenCalled();
    expect(updateState).not.toHaveBeenCalled();
  });

  it("replaces deep-linked issue detail URLs and clears local issue state", () => {
    const updateState = vi.fn();
    const { result } = renderHook(() =>
      useIssueDetailUrl({
        includeProject: true,
        state: {
          ...DEFAULT_STATE,
          assignee: "me",
          issue: "33333333-3333-4333-8333-333333333333",
          issueProject: "project_mobile",
          locale: "fr-FR",
          projectId: "project_website",
          search: "checkout",
        },
        updateState,
      }),
    );

    act(() => {
      result.current.closeIssueDetail();
    });

    expect(navigationMock.router.back).not.toHaveBeenCalled();
    expect(navigationMock.router.replace).toHaveBeenCalledTimes(1);
    const [href, options] = navigationMock.router.replace.mock.calls[0]!;
    expect(new URL(href, "https://hyperlocalise.test").pathname).toBe("/en-US/org/acme/issues");
    expectSearchParams(href, {
      assignee: "me",
      issue: undefined,
      issueProject: undefined,
      locale: "fr-FR",
      projectId: "project_website",
      search: "checkout",
    });
    expect(options).toEqual({ scroll: false });
    expect(updateState).toHaveBeenCalledWith({ issue: undefined, issueProject: undefined });
  });
});
