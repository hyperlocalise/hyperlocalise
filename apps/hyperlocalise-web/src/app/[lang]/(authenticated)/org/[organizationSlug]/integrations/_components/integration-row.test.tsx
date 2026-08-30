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

import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import { CollapsibleIntegrationRow } from "./integration-row";

function renderRow({ isConnected, userIsAdmin }: { isConnected: boolean; userIsAdmin: boolean }) {
  function Harness() {
    const [expanded, setExpanded] = useState(false);

    return (
      <CollapsibleIntegrationRow
        name="Intercom"
        description="Customer support"
        icon={<span>icon</span>}
        isConnected={isConnected}
        userIsAdmin={userIsAdmin}
        expanded={expanded}
        onExpandedChange={setExpanded}
      >
        <p>Support workspace</p>
        <button type="button" disabled={!userIsAdmin}>
          Add connection
        </button>
      </CollapsibleIntegrationRow>
    );
  }

  return render(
    <IntlProvider locale="en" messages={{}}>
      <Harness />
    </IntlProvider>,
  );
}

describe("CollapsibleIntegrationRow", () => {
  it("lets read-only users expand connected details without mutation controls", () => {
    renderRow({ isConnected: true, userIsAdmin: false });

    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View only" }));

    expect(screen.getByText("Support workspace")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add connection" })).toBeDisabled();
  });

  it("keeps disconnected rows collapsed for read-only users", () => {
    renderRow({ isConnected: false, userIsAdmin: false });

    expect(screen.getByText("Admins can connect")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View only" })).not.toBeInTheDocument();
    expect(screen.queryByText("Support workspace")).not.toBeInTheDocument();
  });

  it("lets admins expand a connected row to manage it", () => {
    renderRow({ isConnected: true, userIsAdmin: true });

    fireEvent.click(screen.getByRole("button", { name: "Manage" }));

    expect(screen.getByText("Support workspace")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add connection" })).toBeEnabled();
  });
});
