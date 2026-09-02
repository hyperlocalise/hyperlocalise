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

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorFileGenerateDialog } from "./content-editor-file-generate-dialog";

describe("ContentEditorFileGenerateDialog", () => {
  it.each([
    ["image", "translate on-screen text"],
    ["video", "match the original pacing"],
    ["markdown", "preserve MDX components"],
    ["docx", "heading styles"],
    ["xlsx", "formula cells"],
    ["pptx", "slide layout"],
  ] as const)("shows a file-type-specific placeholder for %s", (viewerId, snippet) => {
    render(
      <ContentEditorTestProviders>
        <ContentEditorFileGenerateDialog
          open
          onOpenChange={vi.fn()}
          mode="generate"
          viewerId={viewerId}
          onSubmit={vi.fn()}
        />
      </ContentEditorTestProviders>,
    );

    expect(screen.getByLabelText(/Instructions for the model/i)).toHaveAttribute(
      "placeholder",
      expect.stringContaining(snippet),
    );
  });
});
