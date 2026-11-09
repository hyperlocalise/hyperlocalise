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

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorSegmentCheckbox } from "./content-editor-segment-checkbox";

describe("ContentEditorSegmentCheckbox", () => {
  it("takes focus when clicked, as browsers that do not focus checkboxes on click need", () => {
    const onCheckedChange = vi.fn();
    renderWithContentEditorProviders(
      <ContentEditorSegmentCheckbox
        segmentId="seg-01"
        segmentKey="home.title"
        checkedSegmentIds={new Set()}
        onCheckedChange={onCheckedChange}
      />,
    );
    const checkbox = screen.getByRole("checkbox", { name: "Select home.title" });

    // A plain click event, unlike user-event, does not move focus.
    fireEvent.click(checkbox);

    expect(checkbox).toHaveFocus();
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
