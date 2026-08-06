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
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { IssueWatchControl } from "./issue-watch-control";

const organizationSlug = "acme";
const projectId = "project_website";
const issueId = "issue_001";

function renderWatchControl(isWatching: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <IssueWatchControl
          organizationSlug={organizationSlug}
          projectId={projectId}
          issueId={issueId}
          isWatching={isWatching}
        />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

describe("IssueWatchControl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders Watching when subscribed", () => {
    renderWatchControl(true);
    expect(screen.getByRole("button", { name: "Watching" })).toBeInTheDocument();
  });

  it("renders Watch when not subscribed", () => {
    renderWatchControl(false);
    expect(screen.getByRole("button", { name: "Watch" })).toBeInTheDocument();
  });

  it("calls unwatch when clicking while watching", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    renderWatchControl(true);
    await user.click(screen.getByRole("button", { name: "Watching" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/orgs/${organizationSlug}/projects/${projectId}/issue-sheet/${issueId}/subscription`,
        { method: "DELETE" },
      );
    });
  });

  it("calls watch when clicking while not watching", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          subscription: {
            issueId,
            userId: "user_001",
            createdAt: "2026-06-07T12:00:00.000Z",
          },
        }),
        { status: 201 },
      ),
    );

    renderWatchControl(false);
    await user.click(screen.getByRole("button", { name: "Watch" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/orgs/${organizationSlug}/projects/${projectId}/issue-sheet/${issueId}/subscription`,
        { method: "POST" },
      );
    });
  });
});
