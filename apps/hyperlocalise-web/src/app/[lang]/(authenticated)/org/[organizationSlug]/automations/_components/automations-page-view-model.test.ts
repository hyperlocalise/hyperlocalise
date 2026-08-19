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
import { createIntl } from "@formatjs/intl";
import { describe, expect, it } from "vite-plus/test";

import { createAutomationSummary } from "./automations.fixture";
import { resolveAutomationCreatorName } from "./automations-page-view-model";

const intl = createIntl({ locale: "en", messages: {} });

describe("resolveAutomationCreatorName", () => {
  it("uses the author display name when present", () => {
    expect(
      resolveAutomationCreatorName(
        intl,
        createAutomationSummary({ authorName: "Ada Lovelace" }),
      ),
    ).toBe("Ada Lovelace");
  });

  it("falls back to Unknown when the author is missing", () => {
    expect(
      resolveAutomationCreatorName(intl, createAutomationSummary({ authorName: null })),
    ).toBe("Unknown");
  });
});
