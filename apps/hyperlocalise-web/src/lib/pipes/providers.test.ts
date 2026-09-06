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

import { isPipesProviderSlug, PIPES_PROVIDER_SLUGS, pipesProvidersForCategory } from "./providers";

describe("pipes providers", () => {
  it("accepts catalog API-key slugs and rejects unknown ones", () => {
    expect(isPipesProviderSlug("ahrefs")).toBe(true);
    expect(isPipesProviderSlug("intercom")).toBe(true);
    expect(isPipesProviderSlug("unknown-provider")).toBe(false);
  });

  it("groups providers by integrations category", () => {
    expect(pipesProvidersForCategory("seo-tools")).toEqual(["ahrefs", "similarweb"]);
    expect(pipesProvidersForCategory("customer-engagement")).toEqual(
      expect.arrayContaining(["hubspot", "intercom", "mailchimp", "resend", "sendgrid"]),
    );
    expect(pipesProvidersForCategory("cms")).toEqual(expect.arrayContaining(["sanity", "webflow"]));
    expect(pipesProvidersForCategory("guidelines")).toEqual(["notion"]);
    expect(pipesProvidersForCategory("collaboration")).toEqual(["atlassian"]);
  });

  it("keeps the exposed slug list stable", () => {
    expect(PIPES_PROVIDER_SLUGS).toContain("atlassian");
    expect(PIPES_PROVIDER_SLUGS).toContain("sanity");
    expect(PIPES_PROVIDER_SLUGS).toContain("webflow");
  });
});
