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
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { IssueRelationshipPicker } from "./issue-relationship-picker";

function renderPicker() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <IssueRelationshipPicker
          organizationSlug="acme"
          excludeIssueId="issue_001"
          onSelect={vi.fn()}
        />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

describe("IssueRelationshipPicker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a humanized kind label, never the raw enum value", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ issues: [] }), { status: 200 }),
    );

    renderPicker();
    await user.click(screen.getByRole("button", { name: /Add relationship/ }));

    // The search input is also role="combobox" (cmdk); the kind Select trigger
    // renders first in the DOM.
    const kindTrigger = screen.getAllByRole("combobox")[0]!;
    expect(within(kindTrigger).getByText("Related")).toBeInTheDocument();
    expect(screen.queryByText("related")).not.toBeInTheDocument();

    await user.click(kindTrigger);
    await user.click(await screen.findByText("Blocked by"));

    expect(within(kindTrigger).getByText("Blocked by")).toBeInTheDocument();
    expect(screen.queryByText("blocked_by")).not.toBeInTheDocument();
  });
});
