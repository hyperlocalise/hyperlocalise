// @vitest-environment happy-dom

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
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { SlackChannelSelect } from "./slack-channel-select";

const apiMocks = vi.hoisted(() => ({
  verifyChannel: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  createApiClient: () => ({
    api: {
      orgs: {
        ":organizationSlug": {
          "agent-slack": {
            channels: {
              verify: { $get: apiMocks.verifyChannel },
            },
          },
        },
      },
    },
  }),
}));

function renderSelect(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </IntlProvider>,
  );
}

describe("SlackChannelSelect", () => {
  afterEach(() => {
    apiMocks.verifyChannel.mockReset();
    vi.useRealTimers();
  });

  it("verifies a channel ID and shows the resolved channel name", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    apiMocks.verifyChannel.mockResolvedValue({
      status: 200,
      json: async () => ({
        channel: { id: "slack:C01234567", name: "release-notes", private: false },
      }),
    });

    renderSelect(
      <SlackChannelSelect organizationSlug="acme" slackConnected value="" onChange={vi.fn()} />,
    );

    await user.type(screen.getByPlaceholderText("C0123456789"), "C01234567");
    await vi.advanceTimersByTimeAsync(400);

    await waitFor(() => {
      expect(apiMocks.verifyChannel).toHaveBeenCalled();
    });

    expect(await screen.findByText("#release-notes")).toBeInTheDocument();
  });

  it("shows an error when the channel cannot be verified", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    apiMocks.verifyChannel.mockResolvedValue({
      status: 404,
      json: async () => ({ error: "slack_channel_not_found" }),
    });

    renderSelect(
      <SlackChannelSelect organizationSlug="acme" slackConnected value="" onChange={vi.fn()} />,
    );

    await user.type(screen.getByPlaceholderText("C0123456789"), "C01234567");
    await vi.advanceTimersByTimeAsync(400);

    await waitFor(() => {
      expect(apiMocks.verifyChannel).toHaveBeenCalled();
    });

    expect(
      await screen.findByText(/Channel not found or the app is not a member/i),
    ).toBeInTheDocument();
  });

  it("calls onChange with the typed channel ID", async () => {
    const onChange = vi.fn();

    renderSelect(
      <SlackChannelSelect organizationSlug="acme" slackConnected value="" onChange={onChange} />,
    );

    await userEvent.type(screen.getByPlaceholderText("C0123456789"), "C01234567");

    expect(onChange).toHaveBeenLastCalledWith("C01234567");
  });
});
