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

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { IntlProvider } from "react-intl";

import { ChatDockTabBar } from "./chat-dock-tab-bar";
import type { ChatDockTab } from "./chat-dock-store";

const tabs: ChatDockTab[] = [
  {
    id: "conv_1",
    title: "Checkout copy",
    draft: "",
    isPending: false,
    isStreaming: true,
    streamSnapshot: null,
    lastError: null,
  },
  {
    id: "conv_2",
    title: "Help docs",
    draft: "",
    isPending: false,
    isStreaming: false,
    streamSnapshot: null,
    lastError: null,
  },
];

describe("ChatDockTabBar", () => {
  it("selects, closes, and creates tabs", async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();
    const onCloseTab = vi.fn();
    const onNewTab = vi.fn();

    render(
      <IntlProvider locale="en" messages={{}}>
        <ChatDockTabBar
          tabs={tabs}
          activeTabId="conv_1"
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
          onNewTab={onNewTab}
        />
      </IntlProvider>,
    );

    expect(screen.getByRole("tab", { name: /Checkout copy/i })).toBeTruthy();
    expect(screen.getByLabelText("Generating response")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: /Help docs/i }));
    expect(onSelectTab).toHaveBeenCalledWith("conv_2");

    await user.click(screen.getAllByLabelText("Close chat")[0]!);
    expect(onCloseTab).toHaveBeenCalledWith("conv_1");

    await user.click(screen.getByRole("button", { name: "New request" }));
    expect(onNewTab).toHaveBeenCalled();
  });
});
