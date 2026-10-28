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

import { chosenRateCard } from "./reports-filter-bar";
import {
  formatChange,
  formatDuration,
  formatRateAmount,
  formatShare,
  formatUsd,
} from "./report-format";
import { createReportsSettings } from "./reports.fixture";
import { DEFAULT_REPORTS_STATE } from "./reports-url-state";

const intl = createIntl({ locale: "en", messages: {} });

describe("Reports formatting", () => {
  it("never rounds a share up to 100% or down to 0% when it is neither", () => {
    expect(formatShare(intl, 0.996)).toBe("over 99%");
    expect(formatShare(intl, 1)).toBe("100%");
    expect(formatShare(intl, 0.004)).toBe("under 1%");
    expect(formatShare(intl, 0)).toBe("0%");
    expect(formatShare(intl, 0.57)).toBe("57%");
    expect(formatShare(intl, null)).toBe("—");
  });

  it("writes a change from zero in the card's own unit, and one day as a day", () => {
    const fromZero = { kind: "difference" as const, value: 60 };
    expect(formatChange(intl, fromZero, 1, (minutes) => formatDuration(intl, minutes))).toBe(
      "+1 h 00 m vs previous day",
    );
    expect(
      formatChange(intl, { kind: "difference", value: 0.72 }, 7, (amount) =>
        formatUsd(intl, amount.toFixed(8)),
      ),
    ).toBe("+$0.72 vs previous 7 days");
    expect(formatChange(intl, { kind: "percent", value: -8 }, 28)).toBe("-8% vs previous 28 days");
    expect(formatChange(intl, { kind: "points", value: 1 }, 28)).toBe(
      "+1 point vs previous 28 days",
    );
    // No line at all while the previous period is not fully recorded.
    expect(formatChange(intl, { kind: "no_earlier_data" }, 28)).toBeUndefined();
  });

  it("keeps every decimal of a small rate", () => {
    expect(formatRateAmount(intl, "0.00125000")).toBe("$0.00125");
    expect(formatRateAmount(intl, "0.12000000")).toBe("$0.12");
  });

  it("falls back to the first rate card when the URL names one that no longer exists", () => {
    const settings = createReportsSettings();
    expect(chosenRateCard({ ...DEFAULT_REPORTS_STATE, rateCard: "Agency B" }, settings)).toBe(
      "Agency B",
    );
    expect(chosenRateCard({ ...DEFAULT_REPORTS_STATE, rateCard: "Gone" }, settings)).toBe(
      "Standard 2026",
    );
    expect(
      chosenRateCard(DEFAULT_REPORTS_STATE, createReportsSettings({ rateCardNames: [] })),
    ).toBeNull();
  });
});
