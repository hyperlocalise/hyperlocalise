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
  ContentEditorKeyTagFilterContext,
  type ContentEditorKeyDetailsEditing,
  describeDesignUrl,
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
    expect(screen.getByRole("link", { name: "Open design figma.com" })).toHaveAttribute(
      "href",
      "https://www.figma.com/file/a",
    );
    expect(screen.queryByRole("button", { name: "Remove tag release-7" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add tag" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit link" })).not.toBeInTheDocument();
  });

  it("does not turn an unsafe stored design value into a link", () => {
    renderDetails({ tags: ["release-7"], designUrl: "javascript:alert(1)" }, null);

    expect(screen.getByText("release-7")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText("Design")).not.toBeInTheDocument();
  });

  it("lets an editor remove an unsafe stored design value", async () => {
    const user = userEvent.setup();
    const edit = editing();
    renderDetails({ tags: [], designUrl: "javascript:alert(1)" }, edit);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove link" }));
    expect(edit.onSetDesignUrl).toHaveBeenCalledWith({ segmentId: "key-1", designUrl: null });
  });

  it("hides the rows a viewer can neither read nor fill", () => {
    renderDetails({ tags: [], designUrl: "https://www.figma.com/file/a" }, null);

    expect(screen.queryByText("Tags")).not.toBeInTheDocument();
    expect(screen.getByText("Design")).toBeInTheDocument();
  });

  it("adds typed tags and removes one", async () => {
    const user = userEvent.setup();
    const edit = editing();
    renderDetails({ tags: ["release-7"] }, edit);

    expect(screen.queryByRole("textbox", { name: "Add tags" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.type(
      screen.getByRole("textbox", { name: "Add tags" }),
      "checkout, release-7 new{Enter}",
    );
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

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByRole("textbox", { name: "Add tags" }), "bad!tag{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("A tag is up to 64 letters");
    expect(edit.onSetTags).not.toHaveBeenCalled();
  });

  it("closes the tag field on Escape without saving", async () => {
    const user = userEvent.setup();
    const edit = editing();
    renderDetails({ tags: [] }, edit);

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByRole("textbox", { name: "Add tags" }), "draft{Escape}");
    expect(screen.queryByRole("textbox", { name: "Add tags" })).not.toBeInTheDocument();
    expect(edit.onSetTags).not.toHaveBeenCalled();
  });

  it("commits a typed tag when the field loses focus", async () => {
    const user = userEvent.setup();
    const edit = editing();
    renderDetails({ tags: [] }, edit);

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByRole("textbox", { name: "Add tags" }), "checkout");
    await user.tab();
    await waitFor(() =>
      expect(edit.onSetTags).toHaveBeenCalledWith({
        segmentIds: ["key-1"],
        addTags: ["checkout"],
        removeTags: [],
      }),
    );
    expect(edit.onSetTags).toHaveBeenCalledTimes(1);
  });

  it("sets, refuses and removes a design link", async () => {
    const user = userEvent.setup();
    const edit = editing();
    const { unmount } = renderDetails({ tags: [] }, edit);

    await user.click(screen.getByRole("button", { name: "Add design link" }));
    const field = screen.getByLabelText("Design link");
    await user.type(field, "javascript:alert(1){Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("https://");
    expect(edit.onSetDesignUrl).not.toHaveBeenCalled();

    await user.clear(field);
    await user.type(field, "https://www.figma.com/file/b{Enter}");
    await waitFor(() =>
      expect(edit.onSetDesignUrl).toHaveBeenCalledWith({
        segmentId: "key-1",
        designUrl: "https://www.figma.com/file/b",
      }),
    );
    unmount();

    renderDetails({ tags: [], designUrl: "https://www.figma.com/file/b" }, edit);
    await user.click(screen.getByRole("button", { name: "Remove link" }));
    expect(edit.onSetDesignUrl).toHaveBeenLastCalledWith({ segmentId: "key-1", designUrl: null });
    expect(edit.onSetDesignUrl).toHaveBeenCalledTimes(2);
  });

  it("removes the link when the field is cleared, and cancels on Escape", async () => {
    const user = userEvent.setup();
    const edit = editing();
    renderDetails({ tags: [], designUrl: "https://www.figma.com/file/b" }, edit);

    await user.click(screen.getByRole("button", { name: "Edit link" }));
    await user.type(screen.getByLabelText("Design link"), "changed{Escape}");
    expect(screen.queryByLabelText("Design link")).not.toBeInTheDocument();
    expect(edit.onSetDesignUrl).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Edit link" }));
    await user.clear(screen.getByLabelText("Design link"));
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(edit.onSetDesignUrl).toHaveBeenCalledWith({ segmentId: "key-1", designUrl: null }),
    );
    expect(edit.onSetDesignUrl).toHaveBeenCalledTimes(1);
  });
});

describe("ContentEditorKeyDetails outside the queue", () => {
  it("offers no editing for a string the queue no longer holds", () => {
    renderDetails({ tags: ["release-7"] }, { ...editing(), canEditSegment: () => false });

    expect(screen.getByText("release-7")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add tag" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add design link" })).not.toBeInTheDocument();
  });
});

describe("ContentEditorKeyDetails tag filter", () => {
  it("filters the list by a tag clicked in the panel", async () => {
    const user = userEvent.setup();
    const filterByTag = vi.fn();
    render(
      <ContentEditorTestProviders>
        <ContentEditorKeyTagFilterContext.Provider value={filterByTag}>
          <ContentEditorKeyDetails segmentId="key-1" tags={["release-7"]} />
        </ContentEditorKeyTagFilterContext.Provider>
      </ContentEditorTestProviders>,
    );

    await user.click(screen.getByRole("button", { name: "Show strings tagged release-7" }));
    expect(filterByTag).toHaveBeenCalledWith("release-7");
  });
});

describe("describeDesignUrl", () => {
  it("names a Figma link by its file and anything else by its host", () => {
    expect(
      describeDesignUrl("https://www.figma.com/design/AbC123/Checkout-v3?node-id=12-34"),
    ).toEqual({ name: "Checkout v3", isFigma: true });
    expect(describeDesignUrl("https://www.figma.com/file/a")).toEqual({
      name: "figma.com",
      isFigma: true,
    });
    expect(describeDesignUrl("https://www.zeroheight.com/x/buttons")).toEqual({
      name: "zeroheight.com",
      isFigma: false,
    });
  });
});

describe("parseTagInput", () => {
  it("splits on commas and spaces and drops repeats", () => {
    expect(parseTagInput(" a, b  c,a ")).toEqual(["a", "b", "c"]);
  });
});
