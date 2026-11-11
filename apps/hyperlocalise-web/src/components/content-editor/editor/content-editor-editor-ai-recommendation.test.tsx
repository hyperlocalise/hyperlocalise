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

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import type { ContentEditorSegmentIntelligence } from "@/components/content-editor/shared/types";

import { ContentEditorEditorAiRecommendation } from "./content-editor-editor-ai-recommendation";

const intelligence: ContentEditorSegmentIntelligence = { glossaryTerms: [] };

describe("ContentEditorEditorAiRecommendation", () => {
  it("does not offer a new recommendation after a refusal for used-up AI credit", () => {
    renderWithContentEditorProviders(
      <ContentEditorEditorAiRecommendation
        intelligence={intelligence}
        isLoading={false}
        error="Your workspace has used all of its AI credit."
        aiCreditExhausted
        onGenerateAiRecommendation={vi.fn()}
      />,
    );

    expect(screen.getByText("Your workspace has used all of its AI credit.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Get recommendation/i })).not.toBeInTheDocument();
  });

  it("still offers a new recommendation after other failures", () => {
    renderWithContentEditorProviders(
      <ContentEditorEditorAiRecommendation
        intelligence={intelligence}
        isLoading={false}
        error="Model unavailable"
        onGenerateAiRecommendation={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Get recommendation/i })).toBeInTheDocument();
  });
});
