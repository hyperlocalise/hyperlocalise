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

import { TooltipProvider } from "@/components/ui/tooltip";

import {
  AutomationShortcutAffordance,
  AutomationShortcutRevealProvider,
  ShortcutHintAnchor,
} from "./automation-shortcut-hint";

function renderHint() {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <TooltipProvider>
        <AutomationShortcutRevealProvider>
          <ShortcutHintAnchor shortcut="save">
            <button type="button">Save</button>
          </ShortcutHintAnchor>
          <AutomationShortcutAffordance onOpen={vi.fn()} />
        </AutomationShortcutRevealProvider>
      </TooltipProvider>
    </IntlProvider>,
  );
}

describe("automation shortcut hints", () => {
  it("keeps hints hidden until Alt is held", async () => {
    const user = userEvent.setup();
    renderHint();

    expect(screen.queryByRole("note", { name: "Keyboard shortcut" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hold Alt" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Alt" });
    const hint = screen.getByRole("note", { name: "Keyboard shortcut" });
    expect(hint).toHaveTextContent("Ctrl");
    expect(hint).toHaveTextContent("S");

    fireEvent.keyUp(window, { key: "Alt" });
    expect(screen.queryByRole("note", { name: "Keyboard shortcut" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hold Alt" }));
  });
});
