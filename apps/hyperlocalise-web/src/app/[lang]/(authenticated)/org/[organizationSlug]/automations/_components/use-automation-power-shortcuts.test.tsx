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
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { AutomationShortcutsDialog } from "./automation-shortcuts-dialog";
import { useAutomationPowerShortcuts } from "./use-automation-power-shortcuts";

function Harness({
  onSave,
  onPrimary,
  onAddNode,
}: {
  onSave?: () => void;
  onPrimary?: () => void;
  onAddNode?: () => void;
}) {
  const { shortcutsOpen, setShortcutsOpen } = useAutomationPowerShortcuts({
    onSave,
    onPrimary,
    onAddNode,
  });
  return (
    <>
      <input aria-label="Name" />
      <AutomationShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        surface="visual_workflow"
      />
    </>
  );
}

function renderHarness(props: Parameters<typeof Harness>[0]) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <Harness {...props} />
    </IntlProvider>,
  );
}

describe("useAutomationPowerShortcuts", () => {
  it("saves from a field with the modifier chord", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderHarness({ onSave });

    await user.click(screen.getByRole("textbox", { name: "Name" }));
    await user.keyboard("{Control>}s{/Control}");
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("runs the primary action and opens the shortcuts list", async () => {
    const user = userEvent.setup();
    const onPrimary = vi.fn();
    renderHarness({ onPrimary });

    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(onPrimary).toHaveBeenCalledOnce();

    await user.keyboard("?");
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    expect(screen.getByText("Test workflow")).toBeInTheDocument();
    expect(screen.getByText("Add a step")).toBeInTheDocument();
    expect(screen.queryByText("Configure with assistant")).not.toBeInTheDocument();

    await user.keyboard("?");
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument();
  });

  it("leaves the shortcut list closed while another dialog is open", async () => {
    const user = userEvent.setup();
    renderHarness({});

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    await user.keyboard("?");
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument();
    dialog.remove();
  });

  it("adds a step with N outside a field, and leaves N in a field", async () => {
    const user = userEvent.setup();
    const onAddNode = vi.fn();
    renderHarness({ onAddNode });

    await user.keyboard("n");
    expect(onAddNode).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("textbox", { name: "Name" }));
    await user.keyboard("n");
    expect(onAddNode).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("n");
  });

  it("leaves save to the dialog while a modal is open", () => {
    const onSave = vi.fn();
    renderHarness({ onSave });

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    fireEvent.keyDown(document, { key: "s", ctrlKey: true });
    expect(onSave).not.toHaveBeenCalled();
    dialog.remove();
  });
});
