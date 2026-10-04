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
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { contentEditorIntelligenceFixture } from "@/components/content-editor/shared/content-editor.fixture";
import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorIntelligencePanel } from "./content-editor-intelligence-panel";
import { matchedGlossaryConceptFixture } from "./content-editor-glossary-concept-card.fixture";

describe("ContentEditorIntelligencePanel", () => {
  it("renders without team props and does not loop on glossary concept state", () => {
    renderWithContentEditorProviders(
      <ContentEditorIntelligencePanel
        intelligence={{
          ...contentEditorIntelligenceFixture,
          glossaryConcepts: [matchedGlossaryConceptFixture],
        }}
        sourceText="Reseller"
        targetText="Đại lý"
      />,
    );

    expect(screen.getByRole("heading", { name: "Translation Intelligence" })).toBeInTheDocument();
  });

  it("finds context from the panel header", async () => {
    const user = userEvent.setup();
    const onFindContext = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorIntelligencePanel
        intelligence={{ ...contentEditorIntelligenceFixture, agentContext: undefined }}
        canTriggerFindContext
        onFindContext={onFindContext}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Find context/i }));
    expect(onFindContext).toHaveBeenCalled();
  });

  it("disables find context when lookup is unavailable", () => {
    renderWithContentEditorProviders(
      <ContentEditorIntelligencePanel
        intelligence={{ ...contentEditorIntelligenceFixture, agentContext: undefined }}
        canTriggerFindContext={false}
        onFindContext={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Find context/i })).toBeDisabled();
  });

  it("shows a disabled loading state while context lookup is running", () => {
    renderWithContentEditorProviders(
      <ContentEditorIntelligencePanel
        intelligence={contentEditorIntelligenceFixture}
        isLookingUpContext
        canTriggerFindContext={false}
        onFindContext={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Finding context/i })).toBeDisabled();
  });

  it("switches to refresh once a lookup has run", async () => {
    const user = userEvent.setup();
    const onFindContext = vi.fn();
    const onRefreshContext = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorIntelligencePanel
        intelligence={{ ...contentEditorIntelligenceFixture, agentContext: "Checkout button" }}
        canTriggerFindContext
        onFindContext={onFindContext}
        onRefreshContext={onRefreshContext}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Refresh context/i }));
    expect(onRefreshContext).toHaveBeenCalled();
    expect(onFindContext).not.toHaveBeenCalled();
  });
});
