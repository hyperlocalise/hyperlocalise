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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { patchIssueSheetListCacheForAssignee } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_components/issue-detail/patch-organization-issue-list-caches";
import type { IssueSheetListQuery } from "@/lib/go-svc/go-svc-client.types";
import {
  EMPTY_CAT_ISSUE_GUIDANCE_STATUS,
  getCatIssueGuidanceStatus,
  requestCatIssueGuidance,
  setCatIssueGuidanceStatus,
} from "./content-editor-issue-guidance-event";

import { ContentEditorEditorIssuesSection } from "./content-editor-editor-issues-section";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

type IssueListCall = {
  organizationSlug: string;
  projectId: string;
  query: IssueSheetListQuery;
};

const goSvcMocks = vi.hoisted(() => {
  const listCalls: IssueListCall[] = [];
  let listHandler: (query: IssueSheetListQuery) => Promise<{ issues: unknown[]; total: number }> =
    async () => ({ issues: [], total: 0 });

  return {
    listCalls,
    setListHandler(handler: (query: IssueSheetListQuery) => Promise<{ issues: unknown[]; total: number }>) {
      listHandler = handler;
    },
    issueSheetList: async (
      organizationSlug: string,
      projectId: string,
      query: IssueSheetListQuery,
    ) => {
      listCalls.push({ organizationSlug, projectId, query });
      return listHandler(query);
    },
    reset() {
      listCalls.length = 0;
      listHandler = async () => ({ issues: [], total: 0 });
    },
  };
});

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    client: {
      issueSheet: {
        list: goSvcMocks.issueSheetList,
        assignableMembers: async () => ({ members: [] }),
      },
    },
    loading: false,
  }),
}));

const ORGANIZATION_SLUG = "acme";
const PROJECT_ID = "proj_1";
const TRANSLATION_KEY_ID = "11111111-1111-4111-8111-111111111111";

const frenchIssue = {
  id: "22222222-2222-4222-8222-222222222222",
  identifier: "HL-1",
  title: "Wrong tone",
  status: "open",
  targetLocale: "fr-FR",
  assignee: "Ada Lovelace",
  assigneeUserId: "33333333-3333-4333-8333-333333333333",
  updatedAt: new Date("2026-08-01T00:00:00.000Z").toISOString(),
};

function renderSection(
  overrides: Partial<React.ComponentProps<typeof ContentEditorEditorIssuesSection>> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const view = render(
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={{}}>
        <ContentEditorEditorIssuesSection
          open
          organizationSlug={ORGANIZATION_SLUG}
          projectId={PROJECT_ID}
          translationKeyId={TRANSLATION_KEY_ID}
          targetLocale="fr-FR"
          stringLink={null}
          canCreate={false}
          {...overrides}
        />
      </IntlProvider>
    </QueryClientProvider>,
  );

  return { ...view, queryClient };
}

function listRequestQueries() {
  return goSvcMocks.listCalls.map((call) => call.query);
}

/** Serves `issues` in pages of `pageSize`, mirroring the list endpoint's paging. */
function stubPagedIssueSheet(issues: (typeof frenchIssue)[], pageSize: number) {
  goSvcMocks.setListHandler(async (query) => {
    const offset = query.offset ?? 0;
    const slice = issues.slice(offset, offset + pageSize);
    return {
      issues: slice,
      total: issues.length,
    };
  });
}

describe("ContentEditorEditorIssuesSection", () => {
  beforeEach(() => {
    goSvcMocks.reset();
    stubPagedIssueSheet([frenchIssue], 100);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setCatIssueGuidanceStatus(EMPTY_CAT_ISSUE_GUIDANCE_STATUS);
  });

  it("scopes the request to the translation key and the active target locale", async () => {
    renderSection();

    await waitFor(() => expect(listRequestQueries()).toHaveLength(1));

    const query = listRequestQueries()[0]!;
    expect(query.translationKeyId).toBe(TRANSLATION_KEY_ID);
    expect(query.locale).toBe("fr-FR");
    expect(query.status).toBe("all");
  });

  it("refetches when the edited locale changes", async () => {
    const onOpenIssueCountChange = vi.fn();
    const { rerender, queryClient } = renderSection({ onOpenIssueCountChange });

    await waitFor(() => expect(listRequestQueries()).toHaveLength(1));
    await waitFor(() => expect(onOpenIssueCountChange).toHaveBeenLastCalledWith(1));

    rerender(
      <QueryClientProvider client={queryClient}>
        <IntlProvider locale="en" messages={{}}>
          <ContentEditorEditorIssuesSection
            open
            organizationSlug={ORGANIZATION_SLUG}
            projectId={PROJECT_ID}
            translationKeyId={TRANSLATION_KEY_ID}
            targetLocale="ja-JP"
            stringLink={null}
            canCreate={false}
            onOpenIssueCountChange={onOpenIssueCountChange}
          />
        </IntlProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(listRequestQueries()).toHaveLength(2));
    expect(listRequestQueries()[1]!.locale).toBe("ja-JP");
    await waitFor(() => expect(onOpenIssueCountChange).toHaveBeenLastCalledWith(1));
    expect(getCatIssueGuidanceStatus()).toEqual({ available: true, openIssueCount: 1 });
  });

  it("reports the open issue count for the segment", async () => {
    const onOpenIssueCountChange = vi.fn();
    renderSection({ onOpenIssueCountChange });

    await waitFor(() => expect(onOpenIssueCountChange).toHaveBeenLastCalledWith(1));
    expect(getCatIssueGuidanceStatus()).toEqual({ available: true, openIssueCount: 1 });
  });

  it("publishes footer guidance while the panel is closed", async () => {
    renderSection({ open: false });

    await waitFor(() =>
      expect(getCatIssueGuidanceStatus()).toEqual({ available: true, openIssueCount: 1 }),
    );
    expect(screen.queryByRole("heading", { name: "Queries" })).toBeNull();
  });

  it("clears footer guidance on unmount", async () => {
    const { unmount } = renderSection();

    await waitFor(() =>
      expect(getCatIssueGuidanceStatus()).toEqual({ available: true, openIssueCount: 1 }),
    );

    unmount();
    expect(getCatIssueGuidanceStatus()).toEqual(EMPTY_CAT_ISSUE_GUIDANCE_STATUS);
  });

  it("opens from the app-shell guidance event", () => {
    const onOpenChange = vi.fn();
    renderSection({ open: false, onOpenChange });

    act(() => {
      requestCatIssueGuidance();
    });

    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("stops after one request when the segment fits on a single page", async () => {
    renderSection();

    await waitFor(() => expect(listRequestQueries()).toHaveLength(1));
    expect(listRequestQueries()[0]!.limit).toBe(100);
  });

  it("pages past the first response so counts cover every issue on the segment", async () => {
    const issues = Array.from({ length: 130 }, (_, index) => ({
      ...frenchIssue,
      id: `2222222${index.toString().padStart(2, "0")}-2222-4222-8222-222222222222`,
      status: index < 120 ? "open" : "resolved",
    }));
    stubPagedIssueSheet(issues, 100);

    const onOpenIssueCountChange = vi.fn();
    renderSection({ onOpenIssueCountChange });

    await waitFor(() => expect(onOpenIssueCountChange).toHaveBeenLastCalledWith(120));
    expect(listRequestQueries()).toHaveLength(2);
    expect(listRequestQueries()[1]!.offset).toBe(100);

    const openHeader = await screen.findByRole("button", { name: /collapse.*open/i });
    expect(openHeader).toHaveTextContent("120");
  });

  it("gives up paging instead of looping when total never gets covered", async () => {
    // A page that never advances toward `total` would spin forever unbounded.
    goSvcMocks.setListHandler(async () => ({
      issues: [frenchIssue],
      total: 10_000,
    }));

    renderSection();

    await waitFor(() => expect(listRequestQueries()).toHaveLength(5));
    expect(listRequestQueries()).toHaveLength(5);
  });

  it("shows status counts from the segment rows rather than a project-wide summary", async () => {
    renderSection();

    const openHeader = await screen.findByRole("button", { name: /collapse.*open/i });
    expect(openHeader).toHaveTextContent("1");
    expect(screen.queryByRole("button", { name: /resolved/i })).toBeNull();
  });

  it("picks up assignee patches written to the shared issue-sheet cache", async () => {
    const { queryClient } = renderSection();

    expect(
      await screen.findByRole("button", { name: "Select assignee: Ada Lovelace" }),
    ).toBeInTheDocument();

    act(() => {
      patchIssueSheetListCacheForAssignee(queryClient, {
        organizationSlug: ORGANIZATION_SLUG,
        projectId: PROJECT_ID,
        issueId: frenchIssue.id,
        assigneeUserId: "44444444-4444-4444-8444-444444444444",
        assignee: "Grace Hopper",
      });
    });

    expect(
      await screen.findByRole("button", { name: "Select assignee: Grace Hopper" }),
    ).toBeInTheDocument();
  });
});
