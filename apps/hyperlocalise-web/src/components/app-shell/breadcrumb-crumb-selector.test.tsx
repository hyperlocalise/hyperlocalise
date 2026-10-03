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
import type { ComponentProps, ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { BreadcrumbCrumbSelector } from "./breadcrumb-crumb-selector";

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/projects/proj_1/settings",
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function renderSelector(props: Partial<ComponentProps<typeof BreadcrumbCrumbSelector>> = {}) {
  const onSelect = vi.fn();

  render(
    <IntlProvider locale="en" messages={{}}>
      <BreadcrumbCrumbSelector
        value="proj_1"
        label="Checkout"
        options={[{ value: "proj_1", label: "Checkout" }]}
        onSelect={onSelect}
        href="/org/acme/projects/proj_1"
        menuLabel="Switch project"
        {...props}
      />
    </IntlProvider>,
  );

  return { onSelect };
}

describe("BreadcrumbCrumbSelector", () => {
  it("links the crumb to the resource when there is only one option", () => {
    renderSelector();

    expect(screen.getByRole("link", { name: "Checkout" })).toHaveAttribute(
      "href",
      "/org/acme/projects/proj_1",
    );
    expect(screen.queryByRole("button", { name: "Switch project" })).not.toBeInTheDocument();
  });

  it("keeps the current page crumb as text on the resource overview", () => {
    renderSelector({ isLast: true });

    expect(screen.queryByRole("link", { name: "Checkout" })).not.toBeInTheDocument();
    expect(screen.getByText("Checkout")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switch project" })).not.toBeInTheDocument();
  });

  it("keeps the switcher and load error visible when the crumb is also a link", async () => {
    const user = userEvent.setup();
    renderSelector({ isError: true, options: [] });

    expect(screen.getByRole("link", { name: "Checkout" })).toHaveAttribute(
      "href",
      "/org/acme/projects/proj_1",
    );

    await user.click(screen.getByRole("button", { name: "Switch project" }));
    expect(screen.getByRole("menuitem", { name: "Unable to load options" })).toBeInTheDocument();
  });

  it("keeps the crumb clickable and lets the user switch among options", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderSelector({
      options: [
        { value: "proj_1", label: "Checkout" },
        { value: "proj_2", label: "Marketing" },
      ],
    });

    expect(screen.getByRole("link", { name: "Checkout" })).toHaveAttribute(
      "href",
      "/org/acme/projects/proj_1",
    );

    await user.click(screen.getByRole("button", { name: "Switch project" }));
    await user.click(screen.getByRole("menuitem", { name: "Marketing" }));

    expect(onSelect).toHaveBeenCalledWith("proj_2");
  });
});
