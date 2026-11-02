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
      listBlogPosts: async () => [
        { id: "post-1", name: "Launch", language: "en", translatedFromId: null },
        { id: "post-2", name: "Launch", language: "zh-cn", translatedFromId: "post-1" },
        { id: "post-3", name: "Launch [fr-FR]", language: "fr-fr", translatedFromId: null },
      ],
    });

    expect(library.emails).toEqual([]);
    expect(library.forms).toEqual([]);
    expect(library.blogPosts).toEqual([{ id: "post-1", name: "Launch" }]);
    expect(library.landingPages).toEqual([]);
    expect(library.websitePages).toEqual([]);
    expect(library.messageTemplates).toEqual([]);
    expect(library.warnings).toEqual([]);
  });
});
