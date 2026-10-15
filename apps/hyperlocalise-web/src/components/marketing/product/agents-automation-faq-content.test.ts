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

import { buildHomepageFaqJsonLd } from "@/components/marketing/homepage-faq-content";

import {
  getAgentsAutomationFaqItems,
  getAgentsAutomationFaqSectionCopy,
} from "./agents-automation-faq-content";

describe("getAgentsAutomationFaqItems", () => {
  it("returns eight FAQs with FAQPage structured data", () => {
    const items = getAgentsAutomationFaqItems("en");
    const copy = getAgentsAutomationFaqSectionCopy("en");

    expect(items).toHaveLength(8);
    expect(copy.heading).toMatch(/you might ask/i);

    const jsonLd = buildHomepageFaqJsonLd("en", items);
    expect(jsonLd.mainEntity).toHaveLength(8);
  });
});
