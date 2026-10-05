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
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import { QaText } from "./qa-findings-table";

describe("QaText", () => {
  it("marks non-breaking spaces so the difference is visible", () => {
    render(
      <IntlProvider locale="en" messages={{}}>
        <QaText text={"$2,000\u00a0per"} tokens={[]} visibleWhitespace />
      </IntlProvider>,
    );

    expect(screen.getByTitle("Non-breaking space")).toHaveTextContent("·");
  });
});
