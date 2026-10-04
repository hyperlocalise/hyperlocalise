"use client";

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
import { observer } from "mobx-react-lite";

import { resolveCatFileViewCapabilities } from "./content-editor-file-view-capabilities";
import { useOptionalCatWorkspace } from "./content-editor-workspace-context";
import { ContentEditorWorkspacePersonaSwitcher } from "./content-editor-workspace-persona-switcher";
import type { ContentEditorWorkspacePersona } from "./content-editor-workspace-persona";
import { DESIGNER_PERSONA_FILE_FAMILIES } from "./content-editor-workspace-persona";

/**
 * Derives the personas that make sense for the current file's content family.
 *
 * - Text files (string queues) → Translator, Reviewer
 * - Visual/office/document files → Designer only (no string queue)
 *
 * Designer-only files suppress the switcher entirely (single persona →
 * ContentEditorWorkspacePersonaSwitcher returns null for length ≤ 1).
 */
export function availablePersonasForFamily(
  family: string,
): readonly ContentEditorWorkspacePersona[] {
  if (DESIGNER_PERSONA_FILE_FAMILIES.has(family as never)) {
    return ["designer"];
  }
  return ["translator", "reviewer"];
}

/** Reviewer mode starts with bulk selection on; other personas start with it off. */
export function applyWorkspacePersona(
  store: NonNullable<ReturnType<typeof useOptionalCatWorkspace>>,
  persona: ContentEditorWorkspacePersona,
  family: string,
) {
  store.ui.setWorkspacePersona(persona, family);
  store.setSelectionMode(persona === "reviewer", { persist: false });
}

export const ContentEditorWorkspacePersonaSwitcherConnected = observer(
  function ContentEditorWorkspacePersonaSwitcherConnected({
    value,
    onChange,
    className,
    size,
    variant,
  }: {
    value?: ContentEditorWorkspacePersona;
    onChange?: (persona: ContentEditorWorkspacePersona) => void;
    className?: string;
    size?: "sm" | "xs";
    variant?: "outline" | "ghost";
  }) {
    const store = useOptionalCatWorkspace();
    const selectedSegment = store?.selectedSegmentView ?? null;

    const capabilities = resolveCatFileViewCapabilities({
      sourcePath: selectedSegment?.sourcePath ?? store?.fileContext.sourcePath,
      contentKind: selectedSegment?.contentKind,
    });

    const availablePersonas = availablePersonasForFamily(capabilities.family);

    const resolvedValue = store?.ui.resolvedPersona ?? value ?? "translator";
    const resolvedOnChange = store
      ? (persona: ContentEditorWorkspacePersona) =>
          applyWorkspacePersona(store, persona, capabilities.family)
      : onChange;

    if (!resolvedOnChange) {
      return null;
    }

    return (
      <ContentEditorWorkspacePersonaSwitcher
        value={resolvedValue}
        onChange={resolvedOnChange}
        availablePersonas={availablePersonas}
        className={className}
        size={size}
        variant={variant}
      />
    );
  },
);
