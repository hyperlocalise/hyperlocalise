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
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  conversationsFixture,
  currentUserFixture,
  issueNotificationsFixture,
} from "./inbox.fixture";
import { InboxList } from "./inbox-list";

function renderInboxList() {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <div className="h-[32rem] w-full max-w-sm">
        <InboxList
          conversations={conversationsFixture}
          currentUser={currentUserFixture}
          hasMoreNotifications={false}
          isError={false}
          isLoading={false}
          isLoadingMoreNotifications={false}
          notifications={issueNotificationsFixture}
          onLoadMoreNotifications={vi.fn()}
          onMarkAllRead={vi.fn()}
          onSelectConversation={vi.fn()}
          onSelectNotification={vi.fn()}
          selection={{ kind: "conversation", id: conversationsFixture[0]!.id }}
          unreadNotificationCount={2}
        />
      </div>
    </IntlProvider>,
  );
}

describe("InboxList filters", () => {
  it("filters unread notifications and hides conversations", async () => {
    const user = userEvent.setup();
    renderInboxList();

    expect(screen.getByText("Translate homepage hero copy")).toBeInTheDocument();
    expect(screen.getByText("Checkout CTA tone feels off")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Unread" }));

    expect(screen.queryByText("Translate homepage hero copy")).not.toBeInTheDocument();
    expect(screen.queryByText("Glossary term mismatch")).not.toBeInTheDocument();
    expect(screen.getByText("Checkout CTA tone feels off")).toBeInTheDocument();
    expect(screen.getByText("Source string needs context")).toBeInTheDocument();
  });

  it("filters email conversations from the type menu", async () => {
    const user = userEvent.setup();
    renderInboxList();

    await user.click(screen.getByRole("button", { name: "Filter by type" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Email" }));

    expect(screen.getByText("Email: Q3 release notes")).toBeInTheDocument();
    expect(screen.queryByText("Translate homepage hero copy")).not.toBeInTheDocument();
    expect(screen.queryByText("Checkout CTA tone feels off")).not.toBeInTheDocument();
  });

  it("shows a clearable empty state when filters match nothing", async () => {
    const user = userEvent.setup();
    renderInboxList();

    await user.click(screen.getByRole("button", { name: "Unread" }));
    await user.click(screen.getByRole("button", { name: "Filter by type" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Email" }));

    expect(screen.getByText("No inbox items match these filters.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Translate homepage hero copy")).toBeInTheDocument();
    expect(screen.getByText("Checkout CTA tone feels off")).toBeInTheDocument();
  });
});
