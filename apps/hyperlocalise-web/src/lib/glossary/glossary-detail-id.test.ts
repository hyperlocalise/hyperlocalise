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

import { resolveGlossaryDetailId } from "./glossary-detail-id";

import { buildCrowdinGlossaryConcordanceUrl } from "./glossary-detail-id";

describe("buildCrowdinGlossaryConcordanceUrl", () => {
  it("builds in-app glossary detail urls for live Crowdin glossary ids", () => {
    expect(
      buildCrowdinGlossaryConcordanceUrl({
        organizationSlug: "test-glossary",
        glossaryId: "crowdin:glossary:718785",
        externalResourceId: "718785",
      }),
    ).toBe("/org/test-glossary/glossaries/crowdin:glossary:718785");
  });

  it("maps numeric Crowdin glossary ids to live detail urls", () => {
    expect(
      buildCrowdinGlossaryConcordanceUrl({
        organizationSlug: "test-glossary",
        glossaryId: "718785",
        externalResourceId: "718785",
      }),
    ).toBe("/org/test-glossary/glossaries/crowdin:glossary:718785");
  });
});

describe("resolveGlossaryDetailId", () => {
  it("returns live Crowdin glossary ids unchanged", () => {
    expect(
      resolveGlossaryDetailId({
        glossaryId: "crowdin:glossary:718785",
        providerKind: "crowdin",
        externalResourceId: "718785",
      }),
    ).toBe("crowdin:glossary:718785");
  });

  it("maps numeric Crowdin glossary ids to live detail ids", () => {
    expect(
      resolveGlossaryDetailId({
        glossaryId: "718785",
        providerKind: "crowdin",
        externalResourceId: "718785",
      }),
    ).toBe("crowdin:glossary:718785");
  });

  it("prefers externalResourceId when glossaryId is numeric", () => {
    expect(
      resolveGlossaryDetailId({
        glossaryId: "7",
        providerKind: "crowdin",
        externalResourceId: "718785",
      }),
    ).toBe("crowdin:glossary:718785");
  });

  it("returns native glossary ids unchanged", () => {
    const nativeId = "22222222-2222-4222-8222-222222222222";
    expect(
      resolveGlossaryDetailId({
        glossaryId: nativeId,
        providerKind: null,
        externalResourceId: null,
      }),
    ).toBe(nativeId);
  });
});
