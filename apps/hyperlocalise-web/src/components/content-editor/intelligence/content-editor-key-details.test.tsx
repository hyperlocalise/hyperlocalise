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

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import {
  ContentEditorKeyDetails,
  ContentEditorKeyDetailsEditingContext,
  type ContentEditorKeyDetailsEditing,
  parseTagInput,
} from "./content-editor-key-details";

function renderDetails(
  props: { tags: string[]; designUrl?: string },
  editing: ContentEditorKeyDetailsEditing | null,
) {
  return render(
    <ContentEditorTestProviders>
      <ContentEditorKeyDetailsEditingContext.Provider value={editing}>
        <ContentEditorKeyDetails segmentId="key-1" {...props} />
      </ContentEditorKeyDetailsEditingContext.Provider>
    </ContentEditorTestProviders>,
  );
}

function editing(): ContentEditorKeyDetailsEditing {
  return {
    isSaving: false,
    canEditSegment: () => true,
    onSetTags: vi.fn().mockResolvedValue(undefined),
    onSetDesignUrl: vi.fn().mockResolvedValue(undefined),
  };
}

describe("ContentEditorKeyDetails", () => {
  it("shows tags and the design link without controls for people who can't edit them", () => {
    renderDetails({ tags: ["release-7"], designUrl: "https://www.figma.com/file/a" }, null);

    expect(screen.getByText("release-7")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open design" })).toHaveAttribute(
      "href",
      "https://www.figma.com/file/a",
    );
    expect(screen.queryByRole("button", { name: "Remove tag release-7" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit link" })).not.toBeInTheDocument();
  });

  it("adds typed tags and removes one", async () => {
    const user = userEvent.setup();
    const edit = editing();
    renderDetails({ tags: ["release-7"] }, edit);

    await user.type(screen.getByRole("textbox", { name: "Add tags" }), "checkout, release-7 new");
    await user.click(screen.getByRole("button", { name: "Add tag" }));
    expect(edit.onSetTags).toHaveBeenCalledWith({
      segmentIds: ["key-1"],
      addTags: ["checkout", "new"],
      removeTags: [],
    });

    await user.click(screen.getByRole("button", { name: "Remove tag release-7" }));
    expect(edit.onSetTags).toHaveBeenLastCalledWith({
      segmentIds: ["key-1"],
      addTags: [],
      removeTags: ["release-7"],
    });
  });

  it("refuses a tag that breaks the rule", async () => {
    const user = userEvent.setup();
    const edit = editing();
    renderDetails({ tags: [] }, edit);

    await user.type(screen.getByRole("textbox", { name: "Add tags" }), "bad!tag");
    await user.click(screen.getByRole("button", { name: "Add tag" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A tag is up to 64 letters");
    expect(edit.onSetTags).not.toHaveBeenCalled();
  });

  it("sets, refuses and removes a design link", async () => {
    const user = userEvent.setup();
    const edit = editing();
    const { unmount } = renderDetails({ tags: [] }, edit);

    await user.click(screen.getByRole("button", { name: "Add design link" }));
    const field = screen.getByLabelText("Design link");
    await user.type(field, "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("https://");
    expect(edit.onSetDesignUrl).not.toHaveBeenCalled();

    await user.clear(field);
    await user.type(field, "https://www.figma.com/file/b");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(edit.onSetDesignUrl).toHaveBeenCalledWith({
        segmentId: "key-1",
        designUrl: "https://www.figma.com/file/b",
      }),
    );
    unmount();

    renderDetails({ tags: [], designUrl: "https://www.figma.com/file/b" }, edit);
    await user.click(screen.getByRole("button", { name: "Edit link" }));
    await user.click(screen.getByRole("button", { name: "Remove link" }));
    expect(edit.onSetDesignUrl).toHaveBeenLastCalledWith({ segmentId: "key-1", designUrl: null });
  });
});

describe("ContentEditorKeyDetails outside the queue", () => {
  it("offers no editing for a string the queue no longer holds", () => {
    renderDetails({ tags: ["release-7"] }, { ...editing(), canEditSegment: () => false });

    expect(screen.getByText("release-7")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Add tags" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add design link" })).not.toBeInTheDocument();
  });
});

describe("parseTagInput", () => {
  it("splits on commas and spaces and drops repeats", () => {
    expect(parseTagInput(" a, b  c,a ")).toEqual(["a", "b", "c"]);
  });
});
