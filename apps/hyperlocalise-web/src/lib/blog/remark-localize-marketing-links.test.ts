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

import { remarkLocalizeMarketingLinks } from "./remark-localize-marketing-links";

describe("remarkLocalizeMarketingLinks", () => {
  it("rewrites link and definition URLs without a locale prefix", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "link",
              url: "/blog/example",
              children: [],
            },
          ],
        },
        {
          type: "definition",
          identifier: "ref",
          label: "ref",
          url: "/product/agents-automation",
          title: null,
        },
      ],
    };

    remarkLocalizeMarketingLinks("de-DE")()(tree);

    expect(tree.children[0].children?.[0].url).toBe("/de-DE/blog/example");
    expect(tree.children[1].url).toBe("/de-DE/product/agents-automation");
  });
});
