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

const mocks = vi.hoisted(() => ({ acceptInvitationAction: vi.fn() }));

vi.mock("../actions", () => ({ acceptInvitationAction: mocks.acceptInvitationAction }));

import { AcceptInvitationForm } from "./accept-invitation-form";

function renderForm() {
  render(
    <IntlProvider locale="en" messages={{}}>
      <AcceptInvitationForm organizationName="Gamma" organizationSlug="gamma" />
    </IntlProvider>,
  );
}

describe("AcceptInvitationForm", () => {
  it.each([
    ["invitation_not_found", /expired or was withdrawn/],
    ["email_not_verified", /Verify your email address/],
    ["workos_unavailable", /could not reach the sign-in service/],
    ["workos_accept_failed", /could not reach the sign-in service/],
    ["membership_not_activated", /not ready yet/],
  ])("explains %s beside the invitation", async (code, text) => {
    mocks.acceptInvitationAction.mockResolvedValue({ error: code });
    renderForm();

    await userEvent.click(screen.getByRole("button", { name: "Accept invitation to Gamma" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(text);
    expect(mocks.acceptInvitationAction.mock.calls.at(-1)?.[1].get("organizationSlug")).toBe(
      "gamma",
    );
  });

  it("tells screen readers while it is accepting", async () => {
    mocks.acceptInvitationAction.mockReturnValue(new Promise(() => {}));
    renderForm();

    await userEvent.click(screen.getByRole("button", { name: "Accept invitation to Gamma" }));

    expect(
      await screen.findByRole("button", { name: "Accepting invitation to Gamma…" }),
    ).toBeTruthy();
  });
});
