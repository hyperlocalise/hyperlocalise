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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import { resetContentEditorTargetInsertForTests } from "@/components/content-editor/editor/content-editor-target-insert";

import { ContentEditorUnicodePanel } from "./content-editor-unicode-panel";

describe("ContentEditorUnicodePanel", () => {
  afterEach(() => {
    resetContentEditorTargetInsertForTests();
  });

  it("stays collapsed until expanded", () => {
    renderWithContentEditorProviders(<ContentEditorUnicodePanel />);

    expect(screen.getByRole("button", { name: "Show unicode characters" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Search unicode symbols")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /NO-BREAK SPACE/ })).not.toBeInTheDocument();
  });

  it("inserts a clicked commonly used character", async () => {
    const user = userEvent.setup();
    const onInsertCharacter = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorUnicodePanel onInsertCharacter={onInsertCharacter} />,
    );

    await user.click(screen.getByRole("button", { name: "Show unicode characters" }));
    await user.click(screen.getByRole("button", { name: "Insert NO-BREAK SPACE (U+00A0)" }));

    expect(onInsertCharacter).toHaveBeenCalledWith("\u00A0");
  });

  it("filters the commonly used table", async () => {
    const user = userEvent.setup();

    renderWithContentEditorProviders(<ContentEditorUnicodePanel defaultOpen />);

    await user.type(screen.getByLabelText("Search unicode symbols"), "euro");

    expect(screen.getByRole("button", { name: "Insert EURO SIGN (U+20AC)" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Insert NO-BREAK SPACE (U+00A0)" }),
    ).not.toBeInTheDocument();
  });

  it("disables insert when the translation is locked", async () => {
    const user = userEvent.setup();
    const onInsertCharacter = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorUnicodePanel
        canInsert={false}
        defaultOpen
        onInsertCharacter={onInsertCharacter}
      />,
    );

    expect(screen.getByRole("button", { name: "Insert NO-BREAK SPACE (U+00A0)" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Insert NO-BREAK SPACE (U+00A0)" }));
    expect(onInsertCharacter).not.toHaveBeenCalled();
  });
});
