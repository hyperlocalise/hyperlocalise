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

import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { SlackChannelSelect } from "./slack-channel-select";

const apiMocks = vi.hoisted(() => ({
  searchChannels: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  createApiClient: () => ({
    api: {
      orgs: {
        ":organizationSlug": {
          "agent-slack": {
            channels: { $get: apiMocks.searchChannels },
          },
        },
      },
    },
  }),
}));

function jsonResponse(channels: Array<{ id: string; name: string; private: boolean }>) {
  return {
    status: 200,
    json: async () => ({ channels }),
  };
}

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
    apiMocks.searchChannels.mockReset();
  });

  it("filters the loaded channel list as the user types", async () => {
    const user = userEvent.setup();
    apiMocks.searchChannels.mockImplementation(async (input: { query?: { q?: string } }) => {
      if (input.query?.q) {
        return jsonResponse([]);
      }

      return jsonResponse([
        { id: "slack:C1", name: "general", private: false },
        { id: "slack:C2", name: "release-notes", private: false },
      ]);
    });

    renderSelect(
      <SlackChannelSelect organizationSlug="acme" slackConnected value="" onChange={vi.fn()} />,
    );

    await user.click(await screen.findByRole("button", { name: /select channel/i }));
    expect(await screen.findByText("#general")).toBeInTheDocument();
    expect(screen.getByText("#release-notes")).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("Search by name or paste a channel ID"),
      "Release Notes",
    );

    expect(screen.queryByText("#general")).not.toBeInTheDocument();
    expect(screen.getByText("#release-notes")).toBeInTheDocument();
  });

  it("merges a remote match that is not in the loaded list", async () => {
    const user = userEvent.setup();
    apiMocks.searchChannels.mockImplementation(async (input: { query?: { q?: string } }) => {
      if (input.query?.q) {
        return jsonResponse([{ id: "slack:C9", name: "release-notes-eu", private: false }]);
      }
      return jsonResponse([{ id: "slack:C1", name: "general", private: false }]);
    });

    renderSelect(
      <SlackChannelSelect organizationSlug="acme" slackConnected value="" onChange={vi.fn()} />,
    );

    await user.click(await screen.findByRole("button", { name: /select channel/i }));
    expect(await screen.findByText("#general")).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("Search by name or paste a channel ID"),
      "release-notes-eu",
    );

    expect(await screen.findByText("#release-notes-eu")).toBeInTheDocument();
    expect(screen.queryByText("#general")).not.toBeInTheDocument();
  });

  it("selects a filtered channel", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    apiMocks.searchChannels.mockResolvedValue(
      jsonResponse([
        { id: "slack:C1", name: "general", private: false },
        { id: "slack:C2", name: "release-notes", private: false },
      ]),
    );

    renderSelect(
      <SlackChannelSelect organizationSlug="acme" slackConnected value="" onChange={onChange} />,
    );

    await user.click(await screen.findByRole("button", { name: /select channel/i }));
    await user.type(screen.getByPlaceholderText("Search by name or paste a channel ID"), "rel");
    await user.click(await screen.findByText("#release-notes"));

    expect(onChange).toHaveBeenCalledWith("slack:C2");
  });
});
