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
  getMarketingIntegrationBySlug,
  getMarketingIntegrations,
  getRelatedIntegrations,
  integrationSlugs,
} from "@/components/marketing/integrations/integrations-page-content";
import { getIntegrationPath } from "@/lib/integrations/integration-path";

describe("integration-path", () => {
  it("builds localized integration detail paths", () => {
    expect(getIntegrationPath("en", "github")).toBe("/en/integrations/github");
  });

  it("returns null for invalid locales", () => {
    expect(getIntegrationPath("invalid", "github")).toBeNull();
  });
});

describe("integrations-page-content", () => {
  it("exposes a catalog entry for every slug", () => {
    const integrations = getMarketingIntegrations("en");

    expect(integrations).toHaveLength(integrationSlugs.length);
    expect(integrations.map((integration) => integration.slug).sort()).toEqual(
      [...integrationSlugs].sort(),
    );
  });

  it("returns integration detail content by slug", () => {
    const integration = getMarketingIntegrationBySlug("en", "github");

    expect(integration?.name).toBe("GitHub");
    expect(integration?.products.length).toBeGreaterThan(0);
    expect(integration?.overview.length).toBeGreaterThan(0);
    expect(integration?.capabilities.length).toBeGreaterThan(0);
    expect(integration?.workflows.length).toBeGreaterThan(0);
    expect(integration?.setupSteps.length).toBeGreaterThan(0);
  });

  it("returns related integrations for catalog entries with relatedSlugs", () => {
    const integration = getMarketingIntegrationBySlug("en", "github");
    expect(integration).not.toBeNull();

    const related = getRelatedIntegrations("en", integration!);
    expect(related.length).toBeGreaterThan(0);
    expect(related.every((item) => item.slug !== "github")).toBe(true);
  });
});
