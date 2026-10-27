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

import { domainsPageMessages } from "./domains-page.messages";
import { guidelinesPageMessages } from "./guidelines-page.messages";
import { hyperlabPageMessages } from "./hyperlab-page.messages";
import { multilingualContentStudioPageMessages } from "./multilingual-content-studio-page.messages";
import { productPageMessages } from "./product-page-content.messages";

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const narratives = [
  productPageMessages.agentsAutomationHowItWorksNarrative.defaultMessage,
  multilingualContentStudioPageMessages.howItWorksNarrative.defaultMessage,
  domainsPageMessages.howItWorksNarrative.defaultMessage,
  guidelinesPageMessages.howItWorksNarrative.defaultMessage,
  hyperlabPageMessages.howItWorksNarrative.defaultMessage,
];

describe("product how-it-works narratives", () => {
  it("uses 150–250 words of full sentences per product page", () => {
    for (const narrative of narratives) {
      const count = wordCount(narrative);
      expect(count).toBeGreaterThanOrEqual(150);
      expect(count).toBeLessThanOrEqual(250);
    }
  });

  it("describes automation inputs, steps, and outputs in prose", () => {
    const narrative = productPageMessages.agentsAutomationHowItWorksNarrative.defaultMessage;
    expect(narrative).toMatch(/starts when/i);
    expect(narrative).toMatch(/Inside the run/i);
    expect(narrative).toMatch(/Outputs land/i);
  });
});
