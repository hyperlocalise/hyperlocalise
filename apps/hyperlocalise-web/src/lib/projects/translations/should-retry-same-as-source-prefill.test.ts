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
import { describe, expect, it } from "vite-plus/test";

import { shouldRetrySameAsSourcePrefill } from "./should-retry-same-as-source-prefill";

describe("shouldRetrySameAsSourcePrefill", () => {
  it("retries needs-review copies of multi-word source text", () => {
    expect(
      shouldRetrySameAsSourcePrefill({
        sourceText: "Enable workspace knowledge for this organization.",
        targetText: "Enable workspace knowledge for this organization.",
        status: "needs_review",
      }),
    ).toBe(true);
  });

  it("keeps single-word needs-review copies", () => {
    expect(
      shouldRetrySameAsSourcePrefill({
        sourceText: "Hyperlocalise",
        targetText: "Hyperlocalise",
        status: "needs_review",
      }),
    ).toBe(false);
  });

  it("keeps approved copies even when the source has multiple words", () => {
    expect(
      shouldRetrySameAsSourcePrefill({
        sourceText: "View automations",
        targetText: "View automations",
        status: "approved",
      }),
    ).toBe(false);
  });

  it("keeps draft copies even when the source has multiple words", () => {
    expect(
      shouldRetrySameAsSourcePrefill({
        sourceText: "View automations",
        targetText: "View automations",
        status: "draft",
      }),
    ).toBe(false);
  });

  it("keeps needs-review rows that already differ from the source", () => {
    expect(
      shouldRetrySameAsSourcePrefill({
        sourceText: "View automations",
        targetText: "Xem tự động hóa",
        status: "needs_review",
      }),
    ).toBe(false);
  });

  it("trims whitespace before comparing text and counting words", () => {
    expect(
      shouldRetrySameAsSourcePrefill({
        sourceText: "  View automations  ",
        targetText: "View automations",
        status: "needs_review",
      }),
    ).toBe(true);
  });
});
