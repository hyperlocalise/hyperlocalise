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

import { listHubspotLibrary } from "./list-library";

describe("listHubspotLibrary", () => {
  it("keeps source content and drops locale copies and language variations", async () => {
    const library = await listHubspotLibrary({
      listEmails: async () => [
        { id: "email-1", name: "Welcome", language: "en" },
        { id: "email-2", name: "Welcome [zh-CN]", language: "zh-cn" },
      ],
      listForms: async () => [{ id: "form-1", name: "Newsletter", language: "en" }],
      listBlogPosts: async () => [
        { id: "post-1", name: "Launch", language: "en", translatedFromId: null },
        { id: "post-2", name: "Launch", language: "zh-cn", translatedFromId: "post-1" },
      ],
      listLandingPages: async () => [
        { id: "land-1", name: "Home landing", language: "en", translatedFromId: null },
      ],
      listWebsitePages: async () => [
        { id: "site-1", name: "Home", language: "en", translatedFromId: null },
        { id: "site-2", name: "Home [fr-FR]", language: "fr-fr", translatedFromId: null },
      ],
    });

    expect(library.emails).toEqual([{ id: "email-1", name: "Welcome" }]);
    expect(library.forms).toEqual([{ id: "form-1", name: "Newsletter" }]);
    expect(library.blogPosts).toEqual([{ id: "post-1", name: "Launch" }]);
    expect(library.landingPages).toEqual([{ id: "land-1", name: "Home landing" }]);
    expect(library.websitePages).toEqual([{ id: "site-1", name: "Home" }]);
    expect(library.messageTemplates).toEqual([]);
    expect(library.warnings).toEqual([]);
  });
});
