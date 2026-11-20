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

import { LOCALISATION_AUDIT_USER_AGENT } from "@/lib/localisation-audit/user-agent";

import {
  buildLocalisationAuditFaqJsonLd,
  getLocalisationAuditFaqItems,
} from "./localisation-audit-faq-content";

describe("localisation audit FAQ JSON-LD", () => {
  it("builds FAQPage structured data from the same FAQ copy as the page", () => {
    const items = getLocalisationAuditFaqItems("en");
    const jsonLd = buildLocalisationAuditFaqJsonLd("en", items);

    expect(items).toHaveLength(4);
    expect(items[2]?.answer).toContain(LOCALISATION_AUDIT_USER_AGENT);
    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: "en",
      mainEntity: items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    });
  });
});
