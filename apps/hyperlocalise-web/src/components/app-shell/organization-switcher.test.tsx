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
import type { ComponentProps } from "react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

import { OrganizationSwitcher } from "./organization-switcher";

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/glossaries",
}));

vi.mock("next/link", () => ({
  default: ({ href, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props} />
  ),
}));

function renderSwitcher(props: Partial<ComponentProps<typeof OrganizationSwitcher>> = {}) {
  render(
    <IntlProvider locale="en" messages={{}}>
      <SidebarProvider>
        <TooltipProvider>
          <OrganizationSwitcher
            activeOrganization={{ name: "Acme Localization", slug: "acme" }}
            organizations={[
              { name: "Acme Localization", slug: "acme" },
              { name: "Beta Workspace", slug: "beta" },
            ]}
            {...props}
          />
        </TooltipProvider>
      </SidebarProvider>
    </IntlProvider>,
  );
}

describe("OrganizationSwitcher", () => {
  it("shows the active workspace name and initial in the trigger", () => {
    renderSwitcher();

    const trigger = screen.getByRole("button", { name: /Current workspace: Acme Localization/ });
    expect(trigger.textContent).toContain("Acme Localization");
    expect(trigger.textContent).toContain("A");
  });

  it("lists workspaces and keeps the current section when switching", async () => {
    renderSwitcher({ showMembersLink: true, canInviteMembers: true });

    await userEvent.click(
      screen.getByRole("button", { name: /Current workspace: Acme Localization/ }),
    );

    const betaLink = await screen.findByRole("menuitem", { name: /Beta Workspace/ });
    expect(betaLink.getAttribute("href")).toBe(
      `/auth/select-organization/beta?returnTo=${encodeURIComponent("/org/beta/glossaries")}`,
    );
    expect(
      screen.getByRole("menuitem", { name: /Acme Localization/ }).getAttribute("aria-current"),
    ).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Workspace settings" }).getAttribute("href")).toBe(
      "/org/acme/settings",
    );
    expect(screen.getByRole("menuitem", { name: "Invite and manage members" })).toBeTruthy();
  });

  it("shows a read-only members link to roles that cannot invite", async () => {
    renderSwitcher({ showMembersLink: true, canInviteMembers: false });

    await userEvent.click(
      screen.getByRole("button", { name: /Current workspace: Acme Localization/ }),
    );

    const membersLink = await screen.findByRole("menuitem", { name: "Members" });
    expect(membersLink.getAttribute("href")).toBe("/org/acme/members");
    expect(screen.queryByRole("menuitem", { name: "Invite and manage members" })).toBeNull();
  });

  it("hides the members link without permission", async () => {
    renderSwitcher();

    await userEvent.click(
      screen.getByRole("button", { name: /Current workspace: Acme Localization/ }),
    );

    await screen.findByRole("menuitem", { name: "Workspace settings" });
    expect(screen.queryByRole("menuitem", { name: "Members" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Invite and manage members" })).toBeNull();
  });
});
