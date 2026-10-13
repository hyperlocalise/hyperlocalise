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

  it("shows the status once, on the switch before the name", () => {
    renderChrome({ workflowStatus: "active", onStatusChange: vi.fn() });

    const status = screen.getByRole("switch", { name: "Active" });
    expect(status).toBeChecked();
    expect(screen.getAllByText("Active")).toHaveLength(1);
    expect(
      status.compareDocumentPosition(screen.getByRole("textbox", { name: "Workflow name" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("names a paused workflow on the switch and turns it on from there", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    renderChrome({ workflowStatus: "paused", onStatusChange });

    expect(screen.getByRole("switch", { name: "Paused" })).not.toBeChecked();
    expect(screen.queryByText("Inactive")).not.toBeInTheDocument();

    await user.click(screen.getByText("Paused"));
    expect(onStatusChange).toHaveBeenCalledWith(true);
  });

  it("calls a workflow that was never published inactive", () => {
    renderChrome({ workflowStatus: "draft", onStatusChange: vi.fn() });

    expect(screen.getByRole("switch", { name: "Inactive" })).not.toBeChecked();
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
