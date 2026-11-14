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
import { createIntl } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import { escapeHtml, quoteDocument } from "./quote-dialog";
import { reportsCostEstimate } from "./reports.fixture";

const intl = createIntl({ locale: "en", messages: {} });

describe("quoteDocument", () => {
  it("prints the estimate's priced lines, fees and total with the person's details", () => {
    const html = quoteDocument(intl, reportsCostEstimate, {
      client: "Globex",
      reference: "PO-77",
      validDays: 14,
      issued: "2026-10-21",
    });
    expect(html).toContain("<dt>For</dt><dd>Globex</dd>");
    expect(html).toContain("<dt>Reference</dt><dd>PO-77</dd>");
    expect(html).toContain("<dt>Date</dt><dd>October 21, 2026</dd>");
    expect(html).toContain("<dt>Valid until</dt><dd>November 4, 2026</dd>");
    const total = Number(reportsCostEstimate.totals.costUsd).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
    expect(html).toContain(total);
    for (const fee of reportsCostEstimate.fixedFees)
      expect(html).toContain(`Fixed fee: ${fee.jobTitle}`);
  });

  it("leaves out empty details and never lets them become markup", () => {
    const html = quoteDocument(intl, reportsCostEstimate, {
      client: `<img src=x onerror="alert(1)">`,
      reference: "",
      validDays: 30,
      issued: "2026-10-21",
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<dt>Reference</dt>");
  });

  it("escapes every character HTML gives meaning to", () => {
    expect(escapeHtml(`a & b < c > d " e ' f`)).toBe("a &amp; b &lt; c &gt; d &quot; e &#39; f");
  });
});
