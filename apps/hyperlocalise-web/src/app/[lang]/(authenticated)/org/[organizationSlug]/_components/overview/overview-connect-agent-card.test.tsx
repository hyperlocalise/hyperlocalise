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

import { TooltipProvider } from "@/components/ui/tooltip";

import { OverviewConnectAgentCard } from "./overview-connect-agent-card";

const mcpUrl = "https://www.hyperlocalise.com/mcp";

function renderCard() {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <TooltipProvider>
        <OverviewConnectAgentCard mcpUrl={mcpUrl} />
      </TooltipProvider>
    </IntlProvider>,
  );
}

describe("OverviewConnectAgentCard", () => {
  it("shows the Claude install command by default", () => {
    renderCard();

    expect(screen.getByRole("heading", { name: "Connect your agent" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Install command for Claude" })).toHaveValue(
      `claude mcp add -t http hyperlocalise ${mcpUrl}`,
    );
    expect(screen.getByText("/mcp")).toBeInTheDocument();
  });

  it("switches the snippet when another client is selected", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("tab", { name: "Codex" }));

    expect(screen.getByRole("textbox", { name: "Install command for Codex" })).toHaveValue(
      `codex mcp add hyperlocalise --url ${mcpUrl}`,
    );
    expect(screen.getByText("codex mcp login hyperlocalise")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Cursor" }));

    expect(screen.getByLabelText("Install command for Cursor")).toHaveTextContent(
      `"url": "${mcpUrl}"`,
    );
    expect(
      screen.getByText("Add this to ~/.cursor/mcp.json, then open Settings → MCP and click Login."),
    ).toBeInTheDocument();
  });

  it("copies the selected install snippet", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderCard();

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(`claude mcp add -t http hyperlocalise ${mcpUrl}`);
  });

  it("hides setup copy in compact mode", () => {
    render(
      <IntlProvider locale="en" messages={{}}>
        <TooltipProvider>
          <OverviewConnectAgentCard compact mcpUrl={mcpUrl} />
        </TooltipProvider>
      </IntlProvider>,
    );

    expect(screen.getByRole("heading", { name: "Connect agent" })).toBeInTheDocument();
    expect(
      screen.queryByText("Access your Hyperlocalise workspace from MCP clients."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Then run")).not.toBeInTheDocument();
  });
});
