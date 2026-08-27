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
  buildCrowdinGlossaryConcordanceUrl,
  buildGlossaryConceptDetailUrl,
  buildGlossaryDetailUrl,
  resolveGlossaryDetailId,
} from "./glossary-detail-id";

describe("buildGlossaryDetailUrl", () => {
  it("builds in-app glossary detail urls for live Crowdin glossary ids", () => {
    expect(
      buildGlossaryDetailUrl({
        organizationSlug: "test-glossary",
        glossaryId: "crowdin:glossary:718785",
        providerKind: "crowdin",
        externalResourceId: "718785",
      }),
    ).toBe("/org/test-glossary/glossaries/crowdin:glossary:718785");
  });

  it("maps numeric Crowdin glossary ids to live detail urls", () => {
    expect(
      buildGlossaryDetailUrl({
        organizationSlug: "test-glossary",
        glossaryId: "718785",
        providerKind: "crowdin",
        externalResourceId: "718785",
      }),
    ).toBe("/org/test-glossary/glossaries/crowdin:glossary:718785");
  });

  it("builds in-app glossary detail urls for native glossaries", () => {
    const nativeId = "22222222-2222-4222-8222-222222222222";
    expect(
      buildGlossaryDetailUrl({
        organizationSlug: "acme",
        glossaryId: nativeId,
        providerKind: null,
      }),
    ).toBe(`/org/acme/glossaries/${nativeId}`);
  });
});

describe("buildGlossaryConceptDetailUrl", () => {
  it("builds in-app concept detail urls for Crowdin glossaries", () => {
    expect(
      buildGlossaryConceptDetailUrl({
        organizationSlug: "test-glossary",
        glossaryId: "7",
        conceptId: "42",
        providerKind: "crowdin",
        externalResourceId: "7",
      }),
    ).toBe("/org/test-glossary/glossaries/crowdin:glossary:7/concepts/42");
  });

  it("builds in-app concept detail urls for native glossaries", () => {
    const nativeId = "22222222-2222-4222-8222-222222222222";
    expect(
      buildGlossaryConceptDetailUrl({
        organizationSlug: "acme",
        glossaryId: nativeId,
        conceptId: "concept-1",
        providerKind: null,
      }),
    ).toBe(`/org/acme/glossaries/${nativeId}/concepts/concept-1`);
  });

  it("percent-encodes concept ids that contain reserved path characters", () => {
    expect(
      buildGlossaryConceptDetailUrl({
        organizationSlug: "acme",
        glossaryId: "crowdin:glossary:7",
        conceptId: "a/b c?d#e",
        providerKind: "crowdin",
        externalResourceId: "7",
      }),
    ).toBe("/org/acme/glossaries/crowdin:glossary:7/concepts/a%2Fb%20c%3Fd%23e");
  });
});

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
