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
import { describe, expect, it } from "vite-plus/test";

import { HomepageFaqSection } from "./homepage-faq-section";

const items = [
  {
    question: "Do I need to replace my TMS?",
    answer: "No. Hyperlocalise works alongside your existing TMS.",
  },
  {
    question: "Can I use my preferred AI models?",
    answer: "Yes. Hyperlocalise is LLM-agnostic.",
  },
] as const;

describe("HomepageFaqSection", () => {
  it("starts collapsed and reveals an answer when its question is selected", async () => {
    const user = userEvent.setup();

    render(
      <IntlProvider locale="en" messages={{}}>
        <HomepageFaqSection items={items} />
      </IntlProvider>,
    );

    const firstQuestion = screen.getByRole("button", { name: items[0].question });
    const secondQuestion = screen.getByRole("button", { name: items[1].question });

    expect(firstQuestion).toHaveAttribute("aria-expanded", "false");
    expect(secondQuestion).toHaveAttribute("aria-expanded", "false");

    await user.click(firstQuestion);

    expect(firstQuestion).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(items[0].answer)).toBeVisible();
  });
});
