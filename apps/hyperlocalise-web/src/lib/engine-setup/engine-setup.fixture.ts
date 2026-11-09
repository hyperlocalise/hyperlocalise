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
import { emptyParsedPage } from "@/lib/localisation-audit/html-parse";
import type { LocalisationAuditCrawledPage } from "@/lib/localisation-audit/types";

export function crawledPageFixture(
  overrides: Partial<LocalisationAuditCrawledPage> & { url: string },
): LocalisationAuditCrawledPage {
  return { ...emptyParsedPage(overrides.url, 200), ...overrides };
}

export const acmeHomePage = crawledPageFixture({
  url: "https://acme.test/",
  htmlLang: "en-AU",
  title: "Acme Flow | Ship translations faster",
  headings: ["Ship translations faster with Acme Flow", "Meet Flow Studio"],
  buttons: ["Start your free trial"],
  textSample:
    "Acme Flow helps your team ship translations faster. Flow Studio lets you review every string in context. You stay in control.",
});

export const acmePricingPage = crawledPageFixture({
  url: "https://acme.test/pricing",
  title: "Pricing | Acme Flow",
  headings: ["Simple pricing for every team"],
  buttons: ["Upgrade to Flow Pro"],
  textSample:
    "Flow Pro includes Flow Studio and unlimited projects. You can cancel any time. Acme Flow is free for small teams.",
});
