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

import { TooltipProvider } from "@/components/ui/tooltip";

import { VisualWorkflowChrome } from "./visual-workflow-chrome";

function renderChrome(props: Partial<ComponentProps<typeof VisualWorkflowChrome>> = {}) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <TooltipProvider>
        <VisualWorkflowChrome
          name="Weekly digest"
          onNameChange={vi.fn()}
          copied={false}
          onExport={vi.fn()}
          onCopy={vi.fn()}
          {...props}
        />
      </TooltipProvider>
    </IntlProvider>,
  );
}

describe("VisualWorkflowChrome", () => {
  it("offers copying and downloading the JSON from one Export menu", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const onExport = vi.fn();
    renderChrome({ onCopy, onExport });

    expect(screen.queryByRole("button", { name: "Copy JSON" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export JSON" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(await screen.findByRole("menuitem", { name: "Copy JSON" }));
    expect(onCopy).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(await screen.findByRole("menuitem", { name: "Export JSON" }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("confirms a copy on the Export button", () => {
    renderChrome({ copied: true });

    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("has no Share button", () => {
    renderChrome();

    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
  });

  it("marks Delete as destructive", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderChrome({ onDelete });

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    expect(deleteButton).toHaveClass("text-destructive");

    await user.click(deleteButton);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
