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

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { WorkspaceOverviewSnapshot } from "@/lib/workspace/overview-snapshot-model";

import { dashboardOverviewFixture } from "./dashboard.fixture";
import { DashboardPageContent } from "./dashboard-page-content";
import type { OverviewSectionStatuses } from "./dashboard-page-view";

const apiMocks = vi.hoisted(() => ({
  metrics: vi.fn(),
  activity: vi.fn(),
  projects: vi.fn(),
  board: vi.fn(),
  automations: vi.fn(),
  liveProjects: vi.fn(),
}));

let latestViewProps: {
  overview: WorkspaceOverviewSnapshot;
  automationsEnabled?: boolean;
  sectionStatus?: OverviewSectionStatuses;
} | null = null;

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/app-shell/store/app-shell-store-context", () => ({
  useAppShellStore: () => ({ chatDock: { openNewTab: vi.fn() } }),
}));

vi.mock("@/components/qa/qa-attention-card", () => ({
  QaAttentionCard: () => null,
}));

vi.mock("./slack-connect-invite-banner", () => ({
  SlackConnectInviteBanner: () => null,
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    client: {
      overview: {
        metrics: apiMocks.metrics,
        activity: apiMocks.activity,
        projects: apiMocks.projects,
        board: apiMocks.board,
        automations: apiMocks.automations,
      },
    },
    loading: false,
  }),
}));

vi.mock("../../_hooks/use-tms-live-projects", () => ({
  useTmsLiveProjects: () => apiMocks.liveProjects(),
}));

vi.mock("./dashboard-page-view", () => ({
  DashboardPageView: (props: {
    overview: WorkspaceOverviewSnapshot;
    automationsEnabled?: boolean;
    sectionStatus?: OverviewSectionStatuses;
  }) => {
    latestViewProps = props;
    return <div data-testid="dashboard-view" />;
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderDashboard(automationsEnabled = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={{}}>
        <DashboardPageContent organizationSlug="acme" automationsEnabled={automationsEnabled} />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe("DashboardPageContent", () => {
  beforeEach(() => {
    latestViewProps = null;
    apiMocks.metrics.mockReset();
    apiMocks.activity.mockReset();
    apiMocks.projects.mockReset();
    apiMocks.board.mockReset();
    apiMocks.automations.mockReset();
    apiMocks.liveProjects.mockReset();
    apiMocks.liveProjects.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      isFetching: false,
    });
  });

  it("loads overview sections from dedicated go-svc endpoints", async () => {
    apiMocks.metrics.mockResolvedValue({ metrics: dashboardOverviewFixture.metrics });
    apiMocks.activity.mockResolvedValue({ activity: dashboardOverviewFixture.activity });
    apiMocks.projects.mockResolvedValue({ projects: dashboardOverviewFixture.projects });
    apiMocks.board.mockResolvedValue({ board: dashboardOverviewFixture.board });
    apiMocks.automations.mockResolvedValue({ automations: dashboardOverviewFixture.automations });

    renderDashboard();

    await waitFor(() => {
      expect(latestViewProps?.overview.metrics.jobs.count).toBe(48);
      expect(latestViewProps?.overview.activity).toHaveLength(4);
      expect(latestViewProps?.overview.projects).toHaveLength(2);
      expect(latestViewProps?.overview.board).toHaveLength(3);
      expect(latestViewProps?.overview.automations).toHaveLength(3);
    });

    expect(apiMocks.metrics).toHaveBeenCalledWith("acme");
    expect(apiMocks.activity).toHaveBeenCalledWith("acme");
    expect(apiMocks.projects).toHaveBeenCalledWith("acme");
    expect(apiMocks.board).toHaveBeenCalledWith("acme");
    expect(apiMocks.automations).toHaveBeenCalledWith("acme");
  });

  it("lets activity render while metrics is still loading", async () => {
    const metrics = deferred<{ metrics: WorkspaceOverviewSnapshot["metrics"] }>();
    apiMocks.metrics.mockReturnValue(metrics.promise);
    apiMocks.activity.mockResolvedValue({ activity: dashboardOverviewFixture.activity });
    apiMocks.projects.mockResolvedValue({ projects: [] });
    apiMocks.board.mockResolvedValue({ board: [] });
    apiMocks.automations.mockResolvedValue({ automations: [] });

    renderDashboard();

    await waitFor(() => {
      expect(latestViewProps?.sectionStatus?.metrics?.isLoading).toBe(true);
      expect(latestViewProps?.sectionStatus?.activity?.isLoading).toBe(false);
      expect(latestViewProps?.overview.activity[0]?.id).toBe("job_failed_sync");
    });
  });

  it("keeps stored projects when live TMS fails", async () => {
    apiMocks.metrics.mockResolvedValue({ metrics: dashboardOverviewFixture.metrics });
    apiMocks.activity.mockResolvedValue({ activity: [] });
    apiMocks.projects.mockResolvedValue({ projects: dashboardOverviewFixture.projects });
    apiMocks.board.mockResolvedValue({ board: [] });
    apiMocks.automations.mockResolvedValue({ automations: [] });
    apiMocks.liveProjects.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
    });

    renderDashboard();

    await waitFor(() => {
      expect(latestViewProps?.overview.projects.map((project) => project.id)).toEqual(
        dashboardOverviewFixture.projects.map((project) => project.id),
      );
      expect(latestViewProps?.sectionStatus?.projects?.isError).toBe(false);
    });
  });

  it("does not fetch automations when the feature is off", async () => {
    apiMocks.metrics.mockResolvedValue({ metrics: dashboardOverviewFixture.metrics });
    apiMocks.activity.mockResolvedValue({ activity: [] });
    apiMocks.projects.mockResolvedValue({ projects: [] });
    apiMocks.board.mockResolvedValue({ board: [] });

    renderDashboard(false);

    await waitFor(() => {
      expect(latestViewProps?.automationsEnabled).toBe(false);
      expect(latestViewProps?.overview.automations).toEqual([]);
    });

    expect(apiMocks.automations).not.toHaveBeenCalled();
  });
});
