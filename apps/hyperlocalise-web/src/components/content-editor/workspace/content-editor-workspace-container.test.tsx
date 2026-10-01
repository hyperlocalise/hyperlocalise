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

import type { ReactElement } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createCatImageFileWorkspaceState,
  createCatVideoFileWorkspaceState,
} from "@/components/content-editor/file-view/content-editor-file-view.fixture";
import { ContentEditorQueueToolbarHost } from "@/components/content-editor/queue/content-editor-queue-toolbar-host";
import {
  contentEditorIntelligenceFixture,
  contentEditorSegmentsFixture,
  createContentEditorWorkspaceState,
  mockValidateFormat,
} from "@/components/content-editor/shared/content-editor.fixture";
import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { createContentEditorLoadingWorkspaceState } from "@/components/content-editor/project-file/project-file-content-editor-mapper";

import { ContentEditorWorkspaceContainer } from "./content-editor-workspace-container";

async function waitForTargetEditor() {
  return waitFor(() =>
    document.querySelector('[aria-label="Target translation"][contenteditable="true"]'),
  );
}

function createUiCatWorkspaceState() {
  return createContentEditorWorkspaceState({
    selectedSegmentId: "seg-02",
    segments: contentEditorSegmentsFixture.filter((segment) =>
      ["seg-01", "seg-02", "seg-03"].includes(segment.id),
    ),
  });
}

function renderCatWorkspace(ui: ReactElement) {
  return renderWithContentEditorProviders(
    <div style={{ height: "900px", width: "1280px" }} className="bg-background text-foreground">
      {ui}
    </div>,
  );
}

describe("ContentEditorWorkspaceContainer UI", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders queue, editor, and intelligence panels on desktop", async () => {
    renderCatWorkspace(
      <ContentEditorWorkspaceContainer
        initialState={createUiCatWorkspaceState()}
        initialViewMode="comfortable"
        services={{ validateFormat: mockValidateFormat }}
      />,
    );

    expect(screen.getByText("Queue")).toBeInTheDocument();
    expect(screen.getByText("Translation Intelligence")).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize queue panel" })).toBeInTheDocument();
    expect(
      screen.getByRole("separator", { name: "Resize translation intelligence panel" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Approve/i })).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Dashboard card showing how many reviews still need approval."),
    ).toBeInTheDocument();
  });

  it("starts in comfortable view when initialViewMode is comfortable", async () => {
    window.localStorage.setItem("content-editor-workspace-view-mode:v1", "side-by-side");

    try {
      renderCatWorkspace(
        <ContentEditorWorkspaceContainer
          initialState={createUiCatWorkspaceState()}
          initialViewMode="comfortable"
          services={{ validateFormat: mockValidateFormat }}
        />,
      );

      const viewModeButton = await waitFor(() =>
        screen.getByRole("button", { name: "Content Editor view mode" }),
      );
      expect(viewModeButton).toHaveTextContent("Comfortable");
      expect(screen.getByText("Translation Intelligence")).toBeInTheDocument();
      expect(screen.queryByText("Source")).not.toBeInTheDocument();
    } finally {
      window.localStorage.removeItem("content-editor-workspace-view-mode:v1");
    }
  });

  it("shows an empty queue state when there are no segments", () => {
    renderCatWorkspace(
      <ContentEditorWorkspaceContainer
        initialState={createContentEditorWorkspaceState({ segments: [], selectedSegmentId: "" })}
      />,
    );

    expect(screen.getByText("No segments in queue.")).toBeInTheDocument();
  });

  it("shows translation-view skeleton without queue skeleton while a file loads", () => {
    renderCatWorkspace(
      <ContentEditorWorkspaceContainer
        initialState={createContentEditorLoadingWorkspaceState({
          sourcePath: "app/dashboard/index.tsx",
          sourceLocale: "en-US",
          targetLocale: "vi",
        })}
        initialViewMode="comfortable"
        isTranslationViewLoading
      />,
    );

    expect(screen.getByLabelText("Loading editor")).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading queue")).not.toBeInTheDocument();
    expect(screen.getByText("Queue")).toBeInTheDocument();
    expect(screen.getByText("No segments in queue.")).toBeInTheDocument();
  });

  it("shows the compact editor skeleton while a file loads on a narrow viewport", () => {
    const originalMatchMedia = window.matchMedia;
    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    window.matchMedia = matchMedia;

    try {
      renderCatWorkspace(
        <ContentEditorWorkspaceContainer
          initialState={createContentEditorLoadingWorkspaceState({
            sourcePath: "app/dashboard/index.tsx",
            sourceLocale: "en-US",
            targetLocale: "vi",
          })}
          initialViewMode="comfortable"
          isTranslationViewLoading
        />,
      );

      expect(screen.getByLabelText("Loading editor")).toBeInTheDocument();
      expect(screen.queryByLabelText("Loading queue")).not.toBeInTheDocument();
      expect(screen.queryByText("No segments in queue.")).not.toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("shows the side-by-side translation skeleton while a file loads", () => {
    renderCatWorkspace(
      <ContentEditorWorkspaceContainer
        initialState={createContentEditorLoadingWorkspaceState({
          sourcePath: "app/dashboard/index.tsx",
          sourceLocale: "en-US",
          targetLocale: "vi",
        })}
        initialViewMode="side-by-side"
        isTranslationViewLoading
      />,
    );

    expect(screen.getByText("Source string")).toBeInTheDocument();
    expect(screen.getByText("Translation")).toBeInTheDocument();
    expect(screen.getByLabelText("Loading segments")).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading queue")).not.toBeInTheDocument();
    expect(screen.queryByText("No segments in queue.")).not.toBeInTheDocument();
  });

  it("calls approve after editing the target translation", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn().mockResolvedValue("reviewed");

    renderCatWorkspace(
      <ContentEditorWorkspaceContainer
        initialState={createUiCatWorkspaceState()}
        initialViewMode="comfortable"
        review={{ onApprove }}
        services={{ validateFormat: mockValidateFormat }}
      />,
    );

    const targetEditor = (await waitForTargetEditor()) as HTMLElement;
    await user.click(targetEditor);
    await user.keyboard("{Control>}a{/Control}Updated translation");
    await user.click(screen.getByRole("button", { name: /Approve/i }));

    await waitFor(() => expect(onApprove).toHaveBeenCalledWith("seg-02", "Updated translation"));
  });

  it("approves with Ctrl+Enter while typing in the comfortable target editor", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn().mockResolvedValue("reviewed");

    renderCatWorkspace(
      <ContentEditorWorkspaceContainer
        initialState={createUiCatWorkspaceState()}
        initialViewMode="comfortable"
        review={{ onApprove }}
        services={{ validateFormat: mockValidateFormat }}
      />,
    );

    const targetEditor = (await waitForTargetEditor()) as HTMLElement;
    await user.click(targetEditor);
    await user.keyboard("{Control>}a{/Control}Saved via shortcut");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Approve/i })).not.toBeDisabled(),
    );
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => expect(onApprove).toHaveBeenCalledWith("seg-02", "Saved via shortcut"));
  });

  it("applies AI suggestions from the editor recommendation panel", async () => {
    const user = userEvent.setup();
    const onUseAiSuggestion = vi.fn();

    renderCatWorkspace(
      <ContentEditorWorkspaceContainer
        initialState={createUiCatWorkspaceState()}
        initialViewMode="comfortable"
        editing={{ onUseAiSuggestion }}
        services={{
          validateFormat: mockValidateFormat,
          generateAiRecommendation: async () => ({
            aiSuggestion: "Thẻ trên bảng điều khiển hiển thị số lượng đánh giá cần phê duyệt.",
          }),
        }}
      />,
    );

    const aiPanel = screen.getByText("AI recommendation").closest("aside");
    expect(aiPanel).toBeTruthy();

    await user.click(within(aiPanel as HTMLElement).getByRole("button", { name: "Use" }));

    expect(onUseAiSuggestion).toHaveBeenCalledWith("seg-02");
  });

  it("uses compact tabs on narrow viewports", async () => {
    const user = userEvent.setup();
    const originalMatchMedia = window.matchMedia;
    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    window.matchMedia = matchMedia;

    try {
      renderCatWorkspace(
        <ContentEditorWorkspaceContainer
          initialState={createUiCatWorkspaceState()}
          services={{ validateFormat: mockValidateFormat }}
        />,
      );

      await waitFor(() => expect(screen.getByRole("tab", { name: "Edit" })).toBeInTheDocument());
      expect(screen.getByRole("tab", { name: "Queue" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "AI" })).toBeInTheDocument();

      await user.click(screen.getByRole("tab", { name: "Queue" }));
      expect(screen.getByRole("tab", { name: "Queue" })).toHaveAttribute("data-active");
      expect(
        screen.queryByRole("separator", { name: "Resize queue panel" }),
      ).not.toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("renders File view for an image file segment", async () => {
    renderCatWorkspace(
      <ContentEditorWorkspaceContainer
        initialState={createCatImageFileWorkspaceState()}
        initialViewMode="file"
        editing={{
          onRegenerateImage: vi.fn(),
          onUploadImage: vi.fn(),
        }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Localised · vi/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: /Original · en-US/i })).toBeInTheDocument();
    expect(screen.getByText("marketing/hero.png")).toBeInTheDocument();
    expect(screen.getByAltText("Localised image")).toBeInTheDocument();
    expect(screen.getByAltText("Original image")).toBeInTheDocument();
    expect(screen.getByText("Upload localised image")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Approve$/i })).toBeEnabled();
  });

  it("renders File view for a video file segment", async () => {
    renderCatWorkspace(
      <ContentEditorWorkspaceContainer
        initialState={createCatVideoFileWorkspaceState()}
        initialViewMode="file"
        editing={{
          onRegenerateImage: vi.fn(),
          onUploadImage: vi.fn(),
        }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Translated · vi/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: /Original · en-US/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sound" })).toBeInTheDocument();
    expect(screen.getByText("onboarding/walkthrough.mp4")).toBeInTheDocument();
    expect(document.querySelectorAll("video")).toHaveLength(2);
    expect(screen.getByText("Upload translated file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Approve$/i })).toBeEnabled();
  });

  it("hides queue toolbar controls in file view", async () => {
    renderCatWorkspace(
      <>
        <ContentEditorQueueToolbarHost />
        <ContentEditorWorkspaceContainer
          initialState={createCatImageFileWorkspaceState()}
          initialViewMode="file"
          editing={{
            onRegenerateImage: vi.fn(),
            onUploadImage: vi.fn(),
          }}
        />
      </>,
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Localised · vi/i })).toBeInTheDocument(),
    );

    expect(screen.queryByRole("button", { name: "Filter queue" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Show multi-select")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Content Editor view mode" }),
    ).not.toBeInTheDocument();
  });

  it("omits the multilingual view when no multilingual configuration is given", async () => {
    const user = userEvent.setup();

    renderCatWorkspace(
      <>
        <ContentEditorQueueToolbarHost />
        <ContentEditorWorkspaceContainer
          initialState={createUiCatWorkspaceState()}
          initialViewMode="comfortable"
          services={{ validateFormat: mockValidateFormat }}
        />
      </>,
    );

    await user.click(
      await waitFor(() => screen.getByRole("button", { name: "Content Editor view mode" })),
    );

    expect(screen.getByRole("menuitemradio", { name: "Side by side" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "Multilingual" })).not.toBeInTheDocument();
  });

  it("offers the multilingual view when a multilingual configuration is given", async () => {
    const user = userEvent.setup();

    renderCatWorkspace(
      <>
        <ContentEditorQueueToolbarHost />
        <ContentEditorWorkspaceContainer
          initialState={createUiCatWorkspaceState()}
          initialViewMode="comfortable"
          multilingual={{
            organizationSlug: "acme",
            projectId: "proj_1",
            sourcePath: "locales/en-US.json",
            sourceLocale: "en-US",
            targetLocales: ["vi", "fr-FR"],
          }}
          services={{ validateFormat: mockValidateFormat }}
        />
      </>,
    );

    await user.click(
      await waitFor(() => screen.getByRole("button", { name: "Content Editor view mode" })),
    );

    expect(screen.getByRole("menuitemradio", { name: "Multilingual" })).toBeInTheDocument();
  });

  it("omits the persona switcher when adaptiveWorkspaceEnabled is false", async () => {
    renderCatWorkspace(
      <ContentEditorWorkspaceContainer
        initialState={createUiCatWorkspaceState()}
        adaptiveWorkspaceEnabled={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "Workspace mode" })).not.toBeInTheDocument();
  });

  it("renders persona switcher and adapts layout to reviewer when adaptiveWorkspaceEnabled is true", async () => {
    const user = userEvent.setup();

    renderCatWorkspace(
      <>
        <ContentEditorQueueToolbarHost />
        <ContentEditorWorkspaceContainer
          initialState={createUiCatWorkspaceState()}
          adaptiveWorkspaceEnabled
        />
      </>,
    );

    const personaButton = await waitFor(() =>
      screen.getByRole("button", { name: "Workspace mode" }),
    );
    expect(personaButton).toBeInTheDocument();

    await user.click(personaButton);

    const reviewerOption = await screen.findByRole("menuitemradio", { name: "Reviewer" });
    expect(reviewerOption).toBeInTheDocument();

    await user.click(reviewerOption);

    // After selecting Reviewer, workspace adapts to side-by-side review table
    await waitFor(() => {
      const workspace = document.querySelector("[data-workspace-persona]");
      expect(workspace).toHaveAttribute("data-workspace-persona", "reviewer");
    });
  });

  it("switches compact panel to queue when reviewer persona is selected, and to edit when translator is selected", async () => {
    const user = userEvent.setup();
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === "(max-width: 1023px)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      renderCatWorkspace(
        <>
          <ContentEditorQueueToolbarHost />
          <ContentEditorWorkspaceContainer
            initialState={createUiCatWorkspaceState()}
            adaptiveWorkspaceEnabled
          />
        </>,
      );

      // Initially in translator mode, compact tab is "Edit"
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Edit" })).toHaveAttribute("data-active");
      });

      // Switch to Reviewer persona
      const personaButton = screen.getByRole("button", { name: "Workspace mode" });
      await user.click(personaButton);
      const reviewerOption = await screen.findByRole("menuitemradio", { name: "Reviewer" });
      await user.click(reviewerOption);

      // Compact tab automatically switches to "Queue"
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Queue" })).toHaveAttribute("data-active");
      });

      // Switch back to Translator persona (menu is still open)
      const translatorOption = await screen.findByRole("menuitemradio", { name: "Translator" });
      await user.click(translatorOption);

      // Compact tab automatically switches to "Edit"
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Edit" })).toHaveAttribute("data-active");
      });
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("synchronizes persona when selecting a view mode from the view switcher under adaptive workspace", async () => {
    const user = userEvent.setup();

    renderCatWorkspace(
      <>
        <ContentEditorQueueToolbarHost />
        <ContentEditorWorkspaceContainer
          initialState={createUiCatWorkspaceState()}
          adaptiveWorkspaceEnabled
        />
      </>,
    );

    // Initial state is translator (Comfortable view)
    await waitFor(() => {
      const workspace = document.querySelector("[data-workspace-persona]");
      expect(workspace).toHaveAttribute("data-workspace-persona", "translator");
    });

    // Open view switcher and select Side-by-side
    const viewButton = await waitFor(() =>
      screen.getByRole("button", { name: "Content Editor view mode" }),
    );
    await user.click(viewButton);
    const sideBySideOption = await screen.findByRole("menuitemradio", { name: "Side by side" });
    await user.click(sideBySideOption);

    // Persona should synchronize to reviewer
    await waitFor(() => {
      const workspace = document.querySelector("[data-workspace-persona]");
      expect(workspace).toHaveAttribute("data-workspace-persona", "reviewer");
    });

    // Select Comfortable (menu is still open)
    const comfortableOption = await screen.findByRole("menuitemradio", { name: "Comfortable" });
    await user.click(comfortableOption);

    // Persona should synchronize back to translator
    await waitFor(() => {
      const workspace = document.querySelector("[data-workspace-persona]");
      expect(workspace).toHaveAttribute("data-workspace-persona", "translator");
    });
  });

  it("scrolls to translation memory in translator persona when adaptive workspace is enabled", async () => {
    const scrollIntoViewMock = vi.fn();
    window.Element.prototype.scrollIntoView = scrollIntoViewMock;
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    try {
      renderCatWorkspace(
        <>
          <ContentEditorQueueToolbarHost />
          <ContentEditorWorkspaceContainer
            initialState={createContentEditorWorkspaceState({
              selectedSegmentId: "seg-02",
              segments: contentEditorSegmentsFixture.filter((segment) =>
                ["seg-01", "seg-02", "seg-03"].includes(segment.id),
              ),
              segmentIntelligence: {
                "seg-02": contentEditorIntelligenceFixture,
              },
            })}
            adaptiveWorkspaceEnabled
          />
        </>,
      );

      await screen.findByText("Translation memory");

      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledWith({
          behavior: "smooth",
          block: "nearest",
        });
      });
    } finally {
      delete (window.HTMLElement.prototype as unknown as { scrollIntoView?: unknown })
        .scrollIntoView;
    }
  });
});
