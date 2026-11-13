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
import { describe, expect, it, vi } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorAdvancedQueueFilterDialog } from "./content-editor-advanced-queue-filter-dialog";

function triggerTexts() {
  return screen
    .getAllByRole("combobox")
    .map((trigger) => trigger.querySelector("[data-slot=select-value]")?.textContent);
}

function renderDialog(
  props: Partial<Parameters<typeof ContentEditorAdvancedQueueFilterDialog>[0]> = {},
) {
  return renderWithContentEditorProviders(
    <ContentEditorAdvancedQueueFilterDialog
      open
      onOpenChange={vi.fn()}
      onApply={vi.fn()}
      providerKind="crowdin"
      {...props}
    />,
  );
}

describe("ContentEditorAdvancedQueueFilterDialog", () => {
  it("shows each choice's wording in its trigger, not the stored value", async () => {
    renderDialog();
    await screen.findByRole("dialog", { name: "Advanced Filter" });

    const triggers = screen.getAllByRole("combobox");
    expect(triggers.length).toBeGreaterThan(2);
    for (const trigger of triggers) {
      expect(trigger.textContent).not.toMatch(/__none__|include_all|exclude_all/);
    }
    expect(screen.getByLabelText("String type")).toHaveTextContent("Select…");
    expect(triggerTexts()).toEqual(
      expect.arrayContaining(["Labels: Include All", "Labels: Exclude All"]),
    );
  });

  it("shows the chosen option's wording after a choice", async () => {
    const user = userEvent.setup();
    renderDialog({ value: { includeLabelMode: "include_any" } });
    await screen.findByRole("dialog", { name: "Advanced Filter" });

    expect(triggerTexts()).toContain("Labels: Include Any");

    await user.click(screen.getByLabelText("String type"));
    await user.click(screen.getByRole("option", { name: "ICU" }));

    expect(screen.getByLabelText("String type")).toHaveTextContent("ICU");
  });
});
