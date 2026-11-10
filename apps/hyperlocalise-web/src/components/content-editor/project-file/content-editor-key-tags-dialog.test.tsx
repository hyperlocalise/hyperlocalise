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

import { ContentEditorKeyTagsDialog } from "./content-editor-key-tags-dialog";

describe("ContentEditorKeyTagsDialog", () => {
  it("adds and removes tags on the ticked strings", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <ContentEditorTestProviders>
        <ContentEditorKeyTagsDialog
          open
          onOpenChange={onOpenChange}
          stringCount={3}
          onSave={onSave}
        />
      </ContentEditorTestProviders>,
    );

    expect(screen.getByRole("heading", { name: "Tags for 3 strings" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Add tags"), "release-7, checkout");
    await user.type(screen.getByLabelText("Remove tags"), "old");
    await user.click(screen.getByRole("button", { name: "Save tags" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        addTags: ["release-7", "checkout"],
        removeTags: ["old"],
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("refuses a tag with a space-free rule break and keeps the dialog open", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <ContentEditorTestProviders>
        <ContentEditorKeyTagsDialog open onOpenChange={vi.fn()} stringCount={1} onSave={onSave} />
      </ContentEditorTestProviders>,
    );

    await user.type(screen.getByLabelText("Add tags"), "bad!tag");
    await user.click(screen.getByRole("button", { name: "Save tags" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A tag is up to 64 letters");
    expect(onSave).not.toHaveBeenCalled();
  });
});
