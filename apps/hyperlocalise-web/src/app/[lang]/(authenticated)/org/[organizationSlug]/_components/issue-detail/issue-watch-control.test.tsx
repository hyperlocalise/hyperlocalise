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
const subscribersPath = `/api/orgs/${organizationSlug}/projects/${projectId}/issue-sheet/${issueId}/subscriptions`;
const subscriptionPath = `/api/orgs/${organizationSlug}/projects/${projectId}/issue-sheet/${issueId}/subscription`;

const subscribersFixture = [
  {
    userId: "user_mina",
    displayName: "Mina Chen",
    avatarUrl: null,
  },
  {
    userId: "user_otto",
    displayName: "Otto Klein",
    avatarUrl: null,
  },
];

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === subscribersPath) {
      return new Response(JSON.stringify({ subscribers: subscribersFixture }), { status: 200 });
    }
    if (url === subscriptionPath && init?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    if (url === subscriptionPath && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          subscription: {
            issueId,
            userId: "user_001",
            createdAt: "2026-06-07T12:00:00.000Z",
          },
        }),
        { status: 201 },
      );
    }
    throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
  });
}

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

  it("renders Unsubscribe when subscribed", async () => {
    mockFetch();
    renderWatchControl(true);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Unsubscribe" })).toBeInTheDocument();
    });
  });

  it("renders Subscribe when not subscribed", async () => {
    mockFetch();
    renderWatchControl(false);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Subscribe" })).toBeInTheDocument();
    });
  });

  it("renders subscriber avatars", async () => {
    mockFetch();
    renderWatchControl(true);
    await waitFor(() => {
      expect(screen.getByTitle("Mina Chen")).toBeInTheDocument();
      expect(screen.getByTitle("Otto Klein")).toBeInTheDocument();
    });
  });

  it("calls unwatch when clicking while subscribed", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();

    renderWatchControl(true);
    await user.click(await screen.findByRole("button", { name: "Unsubscribe" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(subscriptionPath, { method: "DELETE" });
    });
  });

  it("calls watch when clicking while not subscribed", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();

    renderWatchControl(false);
    await user.click(await screen.findByRole("button", { name: "Subscribe" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(subscriptionPath, { method: "POST" });
    });
  });
});
