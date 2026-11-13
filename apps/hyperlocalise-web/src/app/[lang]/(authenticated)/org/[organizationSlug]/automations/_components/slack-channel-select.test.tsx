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
import { useState, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { isSlackChannelMissing, SlackChannelSelect } from "./slack-channel-select";

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

  it("waits for typing to pause before asking Slack, with the form holding the value", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    apiMocks.verifyChannel.mockResolvedValue({
      status: 200,
      json: async () => ({
        channel: { id: "slack:C0123456789", name: "release-notes", private: false },
      }),
    });

    function Controlled() {
      const [value, setValue] = useState("");
      return (
        <SlackChannelSelect
          organizationSlug="acme"
          slackConnected
          value={value}
          onChange={setValue}
        />
      );
    }
    renderSelect(<Controlled />);

    // Well-formed from the ninth character on, so three more keys could each start a lookup.
    await user.type(screen.getByPlaceholderText("C0123456789"), "C0123456789");
    expect(apiMocks.verifyChannel).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => expect(apiMocks.verifyChannel).toHaveBeenCalledOnce());
  });

  it("shows its own message for a bad ID in place of the save's, marked for scrolling", async () => {
    renderSelect(
      <SlackChannelSelect
        organizationSlug="acme"
        slackConnected
        value="general"
        error="Enter a valid Slack channel ID."
        onChange={vi.fn()}
      />,
    );

    const message = screen.getByText("Enter a valid Slack channel ID, such as C0123456789.");
    expect(message).toHaveAttribute("data-slot", "field-error");
    expect(screen.queryByText("Enter a valid Slack channel ID.")).not.toBeInTheDocument();
  });

  it("does not take Slack being disconnected for a missing channel", async () => {
    apiMocks.verifyChannel.mockResolvedValue({
      status: 404,
      json: async () => ({ error: "slack_not_connected" }),
    });
    const queryClient = new QueryClient();

    await expect(
      isSlackChannelMissing({ channelId: "C01234567", organizationSlug: "acme", queryClient }),
    ).resolves.toBe(false);

    apiMocks.verifyChannel.mockResolvedValue({
      status: 404,
      json: async () => ({ error: "slack_channel_not_found" }),
    });
    await expect(
      isSlackChannelMissing({ channelId: "C76543210", organizationSlug: "acme", queryClient }),
    ).resolves.toBe(true);
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
