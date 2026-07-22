/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";
import React from "react";
import { IntlProvider } from "react-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageBranch, MessageBranchPrevious, MessageBranchNext } from "./message";
import { TooltipProvider } from "@/components/ui/tooltip";

describe("MessageBranch Navigation Tooltips", () => {
  it("MessageBranchPrevious renders with tooltip trigger", () => {
    const markup = renderToStaticMarkup(
      <IntlProvider locale="en" messages={{}}>
        <TooltipProvider>
          <MessageBranch>
            <MessageBranchPrevious />
          </MessageBranch>
        </TooltipProvider>
      </IntlProvider>,
    );

    expect(markup).toContain('data-slot="tooltip-trigger"');
    expect(markup).toContain('aria-label="Previous branch"');

    // Ensure no nested buttons
    const buttonCount = (markup.match(/<button/g) || []).length;
    expect(buttonCount).toBe(1);
  });

  it("MessageBranchNext renders with tooltip trigger", () => {
    const markup = renderToStaticMarkup(
      <IntlProvider locale="en" messages={{}}>
        <TooltipProvider>
          <MessageBranch>
            <MessageBranchNext />
          </MessageBranch>
        </TooltipProvider>
      </IntlProvider>,
    );

    expect(markup).toContain('data-slot="tooltip-trigger"');
    expect(markup).toContain('aria-label="Next branch"');

    // Ensure no nested buttons
    const buttonCount = (markup.match(/<button/g) || []).length;
    expect(buttonCount).toBe(1);
  });
});
