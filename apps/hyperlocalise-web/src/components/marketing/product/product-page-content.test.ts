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

import { productPagesBySlug } from "./product-page-content";
import { productPageMessages } from "./product-page-content.messages";

describe("agents automation product copy", () => {
  it("describes creating a multilingual workflow instead of chasing tickets", () => {
    const page = productPagesBySlug["agents-automation"];

    expect(productPageMessages[page.detailsHeadlineKey].defaultMessage).toBe(
      "Build it once. Every language follows it.",
    );
    expect(productPageMessages[page.proofPoints[0]!.titleKey].defaultMessage).toBe(
      "Create the workflow",
    );
    expect(productPageMessages[page.proofPoints[1]!.titleKey].defaultMessage).toBe(
      "It runs in every language",
    );
    expect(productPageMessages[page.proofPoints[2]!.titleKey].defaultMessage).toBe(
      "It lands back in your tools",
    );
    expect(productPageMessages[page.cta.headlineKey].defaultMessage).toBe(
      "Set up the workflow. Watch the next campaign follow it.",
    );
  });
});
