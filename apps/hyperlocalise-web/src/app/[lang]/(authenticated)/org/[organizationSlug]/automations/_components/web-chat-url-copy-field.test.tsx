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

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { TooltipProvider } from "@/components/ui/tooltip";

import { WebChatUrlCopyField } from "./web-chat-url-copy-field";

function renderField() {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <TooltipProvider>
        <WebChatUrlCopyField organizationSlug="acme" automationId="auto-1" />
      </TooltipProvider>
    </IntlProvider>,
  );
}

describe("WebChatUrlCopyField", () => {
  it("shows and copies the absolute public chat URL", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderField();

    const expectedUrl = `${window.location.origin}/en/chat/acme/auto-1`;
    const input = screen.getByRole("textbox", { name: "Public chat URL" });

    await waitFor(() => {
      expect(input).toHaveValue(expectedUrl);
    });

    await user.click(screen.getByRole("button", { name: "Copy chat URL" }));
    expect(writeText).toHaveBeenCalledWith(expectedUrl);
  });
});
