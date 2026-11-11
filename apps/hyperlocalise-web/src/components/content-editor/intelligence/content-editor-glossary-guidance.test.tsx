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
// @vitest-environment happy-dom

import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { contentEditorIntelligenceFixture } from "@/components/content-editor/shared/content-editor.fixture";
import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { matchedGlossaryConceptFixture } from "./content-editor-glossary-concept-card.fixture";
import { ContentEditorGlossaryGuidance } from "./content-editor-glossary-guidance";
import {
  EMPTY_CAT_GLOSSARY_GUIDANCE_STATUS,
  getCatGlossaryGuidanceStatus,
  requestCatGlossaryGuidance,
  setCatGlossaryGuidanceStatus,
} from "./content-editor-glossary-guidance-event";

const intelligenceWithConcept = {
  ...contentEditorIntelligenceFixture,
  glossaryConcepts: [matchedGlossaryConceptFixture],
};

describe("ContentEditorGlossaryGuidance", () => {
  afterEach(() => {
    setCatGlossaryGuidanceStatus(EMPTY_CAT_GLOSSARY_GUIDANCE_STATUS);
  });

  it("publishes the match count for the current segment without opening the panel", () => {
    renderWithContentEditorProviders(
      <ContentEditorGlossaryGuidance
        intelligence={intelligenceWithConcept}
        segmentId="segment-1"
        sourceText="Reseller"
        targetText="Đại lý"
      />,
    );

    expect(getCatGlossaryGuidanceStatus()).toEqual({
      isLoading: false,
      matchCount: 1,
      notRecommendedCount: 1,
    });
    expect(screen.queryByRole("region", { name: "Glossary guidance" })).not.toBeInTheDocument();
  });

  it("publishes a loading status and shows a skeleton while concordance loads", () => {
    renderWithContentEditorProviders(
      <ContentEditorGlossaryGuidance
        intelligence={intelligenceWithConcept}
        isLoading
        segmentId="segment-1"
        sourceText="Reseller"
      />,
    );

    expect(getCatGlossaryGuidanceStatus()).toEqual({
      isLoading: true,
      matchCount: 0,
      notRecommendedCount: 0,
    });

    act(() => requestCatGlossaryGuidance());

    expect(screen.getByRole("region", { name: "Glossary guidance" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(
      screen.getByRole("status", { name: "Checking the glossary for matches" }),
    ).toBeInTheDocument();
  });

  it("keeps the panel open and follows the segment when the selection changes", () => {
    const { rerender } = renderWithContentEditorProviders(
      <ContentEditorGlossaryGuidance
        intelligence={intelligenceWithConcept}
        segmentId="segment-1"
        sourceText="Reseller"
      />,
    );

    act(() => requestCatGlossaryGuidance());
    expect(screen.getAllByText("Reseller").length).toBeGreaterThan(0);

    rerender(
      <ContentEditorGlossaryGuidance
        intelligence={{ ...contentEditorIntelligenceFixture, glossaryConcepts: [] }}
        segmentId="segment-2"
        sourceText="Checkout"
      />,
    );

    expect(screen.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    expect(screen.getByText('No glossary matches for "Checkout"')).toBeInTheDocument();
    expect(getCatGlossaryGuidanceStatus().matchCount).toBe(0);
  });

  it("clears the footer status when unmounted", () => {
    const { unmount } = renderWithContentEditorProviders(
      <ContentEditorGlossaryGuidance
        intelligence={intelligenceWithConcept}
        segmentId="segment-1"
        sourceText="Reseller"
      />,
    );

    unmount();

    expect(getCatGlossaryGuidanceStatus()).toEqual(EMPTY_CAT_GLOSSARY_GUIDANCE_STATUS);
  });
});
