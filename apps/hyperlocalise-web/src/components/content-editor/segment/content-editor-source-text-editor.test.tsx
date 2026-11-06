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
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  ContentEditorSourceTextEditor,
  type ContentEditorSourceTextEditing,
} from "./content-editor-source-text-editor";

function renderEditor(
  editing: Partial<ContentEditorSourceTextEditing> = {},
  props: { isLocked?: boolean } = {},
) {
  const onSave = vi.fn<ContentEditorSourceTextEditing["onSave"]>(async () => undefined);
  render(
    <IntlProvider locale="en" messages={{}}>
      <ContentEditorSourceTextEditor
        segmentId="key-1"
        sourceText="Sign in"
        isLocked={props.isLocked ?? false}
        editing={{ canEdit: true, offerSmallFix: false, isSaving: false, onSave, ...editing }}
      />
    </IntlProvider>,
  );
  return { onSave: editing.onSave ?? onSave };
}

describe("ContentEditorSourceTextEditor", () => {
  it("saves an edit, marked as a small fix when the project offers it", async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor({ offerSmallFix: true });
    expect(screen.getByText("Sign in")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit source text" }));
    const field = screen.getByRole("textbox", { name: "Source text" });
    await user.clear(field);
    await user.type(field, "Log in");
    await user.click(screen.getByRole("checkbox", { name: "Keep translations approved" }));
    await user.click(screen.getByRole("button", { name: "Save source text" }));

    expect(onSave).toHaveBeenCalledWith({
      segmentId: "key-1",
      sourceText: "Log in",
      keepApproved: true,
    });
  });

  it("starts the next edit with the small fix unticked", async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor({ offerSmallFix: true });
    await user.click(screen.getByRole("button", { name: "Edit source text" }));
    await user.type(screen.getByRole("textbox", { name: "Source text" }), "!");
    await user.click(screen.getByRole("checkbox", { name: "Keep translations approved" }));
    await user.click(screen.getByRole("button", { name: "Save source text" }));

    await user.click(screen.getByRole("button", { name: "Edit source text" }));
    expect(screen.getByRole("checkbox", { name: "Keep translations approved" })).not.toBeChecked();
    await user.type(screen.getByRole("textbox", { name: "Source text" }), "?");
    await user.click(screen.getByRole("button", { name: "Save source text" }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ keepApproved: false }));
  });

  it("offers no small fix while approved translations stay approved anyway", async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Edit source text" }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Source text" }), "!");
    await user.click(screen.getByRole("button", { name: "Save source text" }));
    expect(onSave).toHaveBeenCalledWith({
      segmentId: "key-1",
      sourceText: "Sign in!",
      keepApproved: false,
    });
  });

  it("refuses empty text and shows why a save failed", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<ContentEditorSourceTextEditing["onSave"]>(async () => {
      throw new Error("Segment is locked");
    });
    renderEditor({ onSave });
    await user.click(screen.getByRole("button", { name: "Edit source text" }));
    const field = screen.getByRole("textbox", { name: "Source text" });
    await user.clear(field);
    await user.click(screen.getByRole("button", { name: "Save source text" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Source text can't be empty.");
    expect(onSave).not.toHaveBeenCalled();

    await user.type(field, "Log in");
    await user.click(screen.getByRole("button", { name: "Save source text" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Segment is locked");
  });

  it("closes without saving on Cancel or an unchanged text", async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Edit source text" }));
    await user.click(screen.getByRole("button", { name: "Save source text" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit source text" }));
    await user.type(screen.getByRole("textbox", { name: "Source text" }), "!");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });

  it("saves with the editor's shortcut instead of approving, and Escape returns focus", async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();
    const onDocumentKey = vi.fn();
    document.addEventListener("keydown", onDocumentKey);
    await user.click(screen.getByRole("button", { name: "Edit source text" }));
    await user.type(screen.getByRole("textbox", { name: "Source text" }), "!");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(onSave).toHaveBeenCalledWith({
      segmentId: "key-1",
      sourceText: "Sign in!",
      keepApproved: false,
    });
    expect(onDocumentKey).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: "Enter", metaKey: true }),
    );
    document.removeEventListener("keydown", onDocumentKey);

    await user.click(screen.getByRole("button", { name: "Edit source text" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Edit source text" })).toHaveFocus();
  });

  it("offers no editing on a locked string", () => {
    renderEditor({}, { isLocked: true });
    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit source text" })).not.toBeInTheDocument();
  });
});
