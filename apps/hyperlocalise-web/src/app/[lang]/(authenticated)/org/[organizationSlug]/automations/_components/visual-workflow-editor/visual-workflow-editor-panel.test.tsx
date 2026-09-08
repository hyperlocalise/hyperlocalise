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
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { VisualWorkflowEditorPanel } from "./visual-workflow-editor-panel";

function renderPanel({
  open,
  onClose = vi.fn(),
  onOpenPicker = vi.fn(),
}: {
  open: boolean;
  onClose?: () => void;
  onOpenPicker?: () => void;
}) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <VisualWorkflowEditorPanel open={open} onClose={onClose} onOpenPicker={onOpenPicker}>
        <p>Picker contents</p>
      </VisualWorkflowEditorPanel>
    </IntlProvider>,
  );
}

describe("VisualWorkflowEditorPanel", () => {
  it("keeps the 360px sidebar off the canvas below the md breakpoint", () => {
    renderPanel({ open: false });

    const sidebar = screen.getByRole("complementary");
    expect(sidebar.className).toContain("hidden");
    expect(sidebar.className).toContain("md:flex");
    expect(sidebar.className).toContain("md:w-[360px]");
    expect(screen.getByRole("button", { name: "Add node" })).toBeInTheDocument();
  });

  it("overlays the configuration panel on small screens when open", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPanel({ open: true, onClose });

    const sidebar = screen.getByRole("complementary");
    expect(sidebar.className).toContain("absolute");
    expect(sidebar.className).toContain("md:static");
    expect(sidebar.className).not.toContain("hidden");
    expect(screen.queryByRole("button", { name: "Add node" })).not.toBeInTheDocument();

    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    expect(closeButtons.length).toBeGreaterThan(0);
    await user.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
