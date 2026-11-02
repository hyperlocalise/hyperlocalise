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
        { id: "email-2", name: "Welcome [fr-FR]", language: "fr" },
      ],
      listBlogPosts: async () => [
        { id: "post-1", name: "Launch", language: "en", translatedFromId: null },
        { id: "post-2", name: "Launch", language: "zh-cn", translatedFromId: "post-1" },
        { id: "post-3", name: "Launch [fr-FR]", language: "fr-fr", translatedFromId: null },
      ],
      listForms: async () => [
        { id: "form-1", name: "Newsletter", language: "en" },
        { id: "form-2", name: "Newsletter [fr-FR]", language: "fr" },
      ],
      listLandingPages: async () => [
        {
          id: "lp-1",
          name: "Pricing",
          language: "en",
          translatedFromId: null,
          dynamicPageHubDbTableId: null,
        },
        {
          id: "lp-2",
          name: "Pricing",
          language: "fr",
          translatedFromId: "lp-1",
          dynamicPageHubDbTableId: null,
        },
        {
          id: "lp-3",
          name: "Pricing [de-DE]",
          language: "de",
          translatedFromId: null,
          dynamicPageHubDbTableId: null,
        },
        {
          id: "lp-4",
          name: "Catalog",
          language: "en",
          translatedFromId: null,
          dynamicPageHubDbTableId: "table-9",
        },
      ],
      listWebsitePages: async () => [
        {
          id: "site-1",
          name: "About",
          language: "en",
          translatedFromId: null,
          dynamicPageHubDbTableId: null,
        },
        {
          id: "site-2",
          name: "About [fr-FR]",
          language: "fr",
          translatedFromId: null,
          dynamicPageHubDbTableId: null,
        },
      ],
    });

    expect(library.emails).toEqual([{ id: "email-1", name: "Welcome" }]);
    expect(library.forms).toEqual([{ id: "form-1", name: "Newsletter" }]);
    expect(library.blogPosts).toEqual([{ id: "post-1", name: "Launch" }]);
    expect(library.landingPages).toEqual([{ id: "lp-1", name: "Pricing" }]);
    expect(library.websitePages).toEqual([{ id: "site-1", name: "About" }]);
    expect(library.messageTemplates).toEqual([]);
    expect(library.warnings).toEqual([]);
  });
});
