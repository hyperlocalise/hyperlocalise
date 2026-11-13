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

import {
  buildIntegrationBreadcrumbJsonLd,
  buildIntegrationFaqJsonLd,
} from "@/components/marketing/integrations/integration-detail-json-ld";
import { getMarketingIntegrationBySlug } from "@/components/marketing/integrations/integrations-page-content";

describe("integration detail JSON-LD", () => {
  it("builds FAQPage structured data from the same FAQ copy as the page", () => {
    const integration = getMarketingIntegrationBySlug("en", "github");
    expect(integration).not.toBeNull();

    const jsonLd = buildIntegrationFaqJsonLd("en", integration!);

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: "en",
    });
    expect(jsonLd?.mainEntity).toEqual(
      integration!.faqs.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    );
  });

  it("builds BreadcrumbList structured data for the integrations trail", () => {
    const integration = getMarketingIntegrationBySlug("en", "slack");
    expect(integration).not.toBeNull();

    expect(buildIntegrationBreadcrumbJsonLd("en", integration!)).toMatchObject({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Integrations",
          item: "https://www.hyperlocalise.com/en/integrations",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Slack",
          item: "https://www.hyperlocalise.com/en/integrations/slack",
        },
      ],
    });
  });
});
