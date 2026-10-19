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

import { sanityDocumentTypesQuerySchema } from "./sanity.schema";

describe("sanityDocumentTypesQuerySchema", () => {
  it("parses comma-separated type names", () => {
    expect(sanityDocumentTypesQuerySchema.parse({ typeNames: "post, page" })).toEqual({
      typeNames: ["post", "page"],
    });
  });

  it("defaults to an empty list when typeNames is omitted", () => {
    expect(sanityDocumentTypesQuerySchema.parse({})).toEqual({ typeNames: [] });
  });
});
