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
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { GuidelinesBoardMock } from "./guidelines-board-mock";

describe("GuidelinesBoardMock", () => {
  it("flags the PDF clauses after send and highlights the matching clause", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <IntlProvider locale="en" messages={{}}>
        <GuidelinesBoardMock autoStart={false} />
      </IntlProvider>,
    );

    expect(screen.getByText("Check copy against the PDF")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      screen.getByText(
        'Check this German launch line against Brand-claims-policy.pdf: "Unsere einzigartige KI-Plattform ist klinisch erwiesen."',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Check copy against the PDF")).not.toBeInTheDocument();

    act(() => {
      vi.runAllTimers();
    });

    expect(screen.getByText("Superlative in DE copy")).toBeInTheDocument();
    expect(screen.getByText("Unapproved health claim")).toBeInTheDocument();
    expect(screen.getByText("Missing AI disclosure")).toBeInTheDocument();
    expect(document.getElementById("guideline-clause-german")).toHaveAttribute(
      "aria-current",
      "true",
    );

    await user.click(screen.getByRole("button", { name: /Unapproved health claim/ }));

    expect(document.getElementById("guideline-clause-health")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(document.getElementById("guideline-clause-german")).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Replay" })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("starts playback from the empty-state suggestion", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <IntlProvider locale="en" messages={{}}>
        <GuidelinesBoardMock autoStart={false} />
      </IntlProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Review this German launch line" }));

    expect(screen.queryByText("Check copy against the PDF")).not.toBeInTheDocument();
    expect(screen.queryByText("Superlative in DE copy")).not.toBeInTheDocument();

    act(() => {
      vi.runAllTimers();
    });

    expect(screen.getByText("Superlative in DE copy")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("opens the Drive PDF when a flag is selected from another source", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <IntlProvider locale="en" messages={{}}>
        <GuidelinesBoardMock autoStart={false} />
      </IntlProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Send" }));
    act(() => {
      vi.runAllTimers();
    });

    await user.click(screen.getByRole("button", { name: /Japan market notes/ }));
    expect(screen.getByText("Page preview")).toBeInTheDocument();
    expect(document.getElementById("guideline-clause-ai")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Missing AI disclosure/ }));

    expect(document.getElementById("guideline-clause-ai")).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("4.3 AI features")).toBeInTheDocument();

    vi.useRealTimers();
  });
});
