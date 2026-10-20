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

import { buildSanityDocumentSourcePath, hashSanityTranslationMap } from "./document-json";

describe("sanity document json", () => {
  it("builds stable source paths", () => {
    expect(
      buildSanityDocumentSourcePath({
        sanityProjectId: "abc123",
        dataset: "production",
        documentType: "page",
        documentId: "drafts.page-1",
        slug: "home",
      }),
    ).toMatch(/^sanity\/abc123\/production\/page\/home-[a-f0-9]{8}\.json$/);
  });

  it("hashes maps deterministically", () => {
    const left = hashSanityTranslationMap({ b: "2", a: "1" });
    const right = hashSanityTranslationMap({ a: "1", b: "2" });
    expect(left).toBe(right);
  });
});
