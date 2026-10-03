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
import { makeAutoObservable } from "mobx";

import { sameSegmentIdList } from "@/components/content-editor/side-by-side/content-editor-side-by-side-visible-range";
import {
  contentEditorPageLimitForViewMode,
  readCatWorkspaceViewMode,
  writeCatWorkspaceViewMode,
  type ContentEditorWorkspaceViewMode,
} from "@/components/content-editor/workspace/content-editor-workspace-view-mode";
import {
  DESIGNER_PERSONA_FILE_FAMILIES,
  defaultPersonaForFileFamily,
  readCatWorkspacePersona,
  writeCatWorkspacePersona,
  type ContentEditorWorkspacePersona,
} from "@/components/content-editor/workspace/content-editor-workspace-persona";

export class ContentEditorWorkspaceUiStore {
  viewMode: ContentEditorWorkspaceViewMode;
  /** True while the translation/editor pane is waiting for a new file snapshot. */
  translationViewLoading = false;
  /** Rows intersecting the side-by-side scrollport. Used for QA after hydration. */
  visibleSideBySideSegmentIds: string[] = [];
  /** Rendered side-by-side rows, including overscan. Used to fetch translations. */
  loadSideBySideSegmentIds: string[] = [];
  /** Bumped when the reviewer asks to open the full QA list in the sidebar. */
  qaDetailsRevealNonce = 0;
  /** True when the workspace was given a multilingual table configuration. */
  multilingualViewAvailable = false;
  // Explicit initial modes (e.g. marketing demos) must not overwrite the
  // visitor's real CAT workspace preference.
  #persistViewMode: boolean;

  /**
   * Whether the adaptive workspace persona system is active.
   * Controlled by the release-content-editor-adaptive-workspace release flag.
   */
  adaptiveWorkspaceEnabled = false;

  /**
   * Current workspace persona. Stored per-file-family so switching between
   * an image file and a string file remembers a separate preference for each.
   * Null means the persona has not been resolved yet for the current file family.
   */
  workspacePersona: ContentEditorWorkspacePersona | null = null;

  /**
   * File family used to scope persona persistence (e.g. "image", "text").
   * Starts as null so the initial applyFileFamily("text") does not early return
   * before reading saved preferences from localStorage.
   */
  #currentFileFamily: string | null = null;

  constructor(initialViewMode?: ContentEditorWorkspaceViewMode) {
    this.viewMode = initialViewMode ?? readCatWorkspaceViewMode();
    this.#persistViewMode = initialViewMode === undefined;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get pageLimit() {
    return contentEditorPageLimitForViewMode(this.viewMode);
  }

  get isSideBySideView() {
    return this.viewMode === "side-by-side";
  }

  get isFileView() {
    return this.viewMode === "file";
  }

  get resolvedPersona(): ContentEditorWorkspacePersona {
    return this.workspacePersona ?? defaultPersonaForFileFamily(this.#currentFileFamily ?? "text");
  }

  get isDesignerPersona(): boolean {
    return this.resolvedPersona === "designer";
  }

  get isReviewerPersona(): boolean {
    return this.resolvedPersona === "reviewer";
  }

  get isTranslatorPersona(): boolean {
    return this.resolvedPersona === "translator";
  }

  setAdaptiveWorkspaceEnabled(enabled: boolean) {
    if (this.adaptiveWorkspaceEnabled === enabled) {
      return;
    }
    this.adaptiveWorkspaceEnabled = enabled;
    if (enabled && this.#currentFileFamily) {
      const isDesignerFamily = Boolean(
        this.#currentFileFamily &&
        DESIGNER_PERSONA_FILE_FAMILIES.has(this.#currentFileFamily as never),
      );
      if (isDesignerFamily) {
        this.#applyPersonaLayout(this.resolvedPersona, { persistViewMode: false });
      } else {
        const savedViewMode = readCatWorkspaceViewMode();
        if (savedViewMode === "multilingual" && this.multilingualViewAvailable) {
          this.setViewMode("multilingual", { persistViewMode: false });
        } else {
          this.#applyPersonaLayout(this.resolvedPersona, { persistViewMode: false });
        }
      }
    }
  }

  setViewMode(mode: ContentEditorWorkspaceViewMode, options?: { persistViewMode?: boolean }) {
    const previousMode = this.viewMode;
    this.viewMode = mode;
    const shouldPersistViewMode = (options?.persistViewMode ?? true) && this.#persistViewMode;
    if (shouldPersistViewMode) {
      if (
        !this.adaptiveWorkspaceEnabled ||
        mode === "multilingual" ||
        (previousMode === "multilingual" && mode !== "file")
      ) {
        writeCatWorkspaceViewMode(mode);
      }
    }
    if (mode !== "side-by-side") {
      this.setSideBySideViewport({ visibleSegmentIds: [], loadSegmentIds: [] });
    }
    if (this.adaptiveWorkspaceEnabled && this.#persistViewMode) {
      const isDesignerFamily = Boolean(
        this.#currentFileFamily &&
        DESIGNER_PERSONA_FILE_FAMILIES.has(this.#currentFileFamily as never),
      );
      const targetPersona: ContentEditorWorkspacePersona | null =
        mode === "side-by-side"
          ? isDesignerFamily
            ? null
            : "reviewer"
          : mode === "comfortable"
            ? isDesignerFamily
              ? null
              : "translator"
            : mode === "file"
              ? "designer"
              : null;
      if (targetPersona && this.workspacePersona !== targetPersona) {
        this.workspacePersona = targetPersona;
        writeCatWorkspacePersona(this.#currentFileFamily ?? "text", targetPersona);
      }
    }
  }

  #applyPersonaLayout(
    persona: ContentEditorWorkspacePersona,
    options?: { persistViewMode?: boolean },
  ) {
    if (!this.#persistViewMode) {
      return;
    }
    if (persona === "designer") {
      this.setViewMode("file", options);
    } else if (persona === "reviewer") {
      this.setViewMode("side-by-side", options);
    } else if (persona === "translator") {
      this.setViewMode("comfortable", options);
    }
  }

  /**
   * Called when the active file family changes (e.g. switching from a string
   * file to an image file). Loads the stored persona preference for the new
   * family, falling back to the auto-detected default.
   */
  applyFileFamily(fileFamily: string) {
    if (this.#currentFileFamily === fileFamily) {
      return;
    }

    this.#currentFileFamily = fileFamily;
    const stored = readCatWorkspacePersona(fileFamily);
    this.workspacePersona = stored;

    if (this.adaptiveWorkspaceEnabled) {
      const isDesignerFamily = Boolean(
        fileFamily && DESIGNER_PERSONA_FILE_FAMILIES.has(fileFamily as never),
      );
      if (isDesignerFamily) {
        this.#applyPersonaLayout(this.resolvedPersona, { persistViewMode: false });
      } else {
        const savedViewMode = readCatWorkspaceViewMode();
        if (savedViewMode === "multilingual" && this.multilingualViewAvailable) {
          this.setViewMode("multilingual", { persistViewMode: false });
        } else {
          this.#applyPersonaLayout(this.resolvedPersona, { persistViewMode: false });
        }
      }
    }
  }

  /**
   * Explicitly set the workspace persona. Persists the choice under the
   * current file family so it is restored on future visits, and drives the
   * corresponding workspace layout preset.
   */
  setWorkspacePersona(persona: ContentEditorWorkspacePersona, fileFamily?: string) {
    const family = fileFamily ?? this.#currentFileFamily ?? "text";
    this.#currentFileFamily = family;
    this.workspacePersona = persona;
    writeCatWorkspacePersona(family, persona);
    this.#applyPersonaLayout(persona);
  }

  revealQaDetails() {
    this.qaDetailsRevealNonce += 1;
  }

  setSideBySideViewport(input: { visibleSegmentIds: string[]; loadSegmentIds: string[] }) {
    const visibleUnchanged = sameSegmentIdList(
      this.visibleSideBySideSegmentIds,
      input.visibleSegmentIds,
    );
    const loadUnchanged = sameSegmentIdList(this.loadSideBySideSegmentIds, input.loadSegmentIds);
    if (visibleUnchanged && loadUnchanged) {
      return;
    }

    if (!visibleUnchanged) {
      this.visibleSideBySideSegmentIds = input.visibleSegmentIds;
    }
    if (!loadUnchanged) {
      this.loadSideBySideSegmentIds = input.loadSegmentIds;
    }
  }

  setTranslationViewLoading(loading: boolean) {
    this.translationViewLoading = loading;
  }

  setMultilingualViewAvailable(available: boolean) {
    if (this.multilingualViewAvailable === available) {
      return;
    }
    this.multilingualViewAvailable = available;
    if (available && this.adaptiveWorkspaceEnabled && this.#persistViewMode) {
      const isDesignerFamily = Boolean(
        this.#currentFileFamily &&
        DESIGNER_PERSONA_FILE_FAMILIES.has(this.#currentFileFamily as never),
      );
      if (!isDesignerFamily && readCatWorkspaceViewMode() === "multilingual") {
        this.setViewMode("multilingual", { persistViewMode: false });
      }
    }
  }
}
