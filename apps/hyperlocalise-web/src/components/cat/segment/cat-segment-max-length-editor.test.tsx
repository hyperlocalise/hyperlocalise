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

import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { CatSegmentMaxLengthEditor } from "./cat-segment-max-length-editor";

function renderEditor(overrides: Partial<Parameters<typeof CatSegmentMaxLengthEditor>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);

  render(
    <IntlProvider locale="en">
      <CatSegmentMaxLengthEditor maxLength={80} canEdit onSave={onSave} {...overrides} />
    </IntlProvider>,
  );

  return { onSave };
}

describe("CatSegmentMaxLengthEditor", () => {
  it("shows the current limit in read-only mode", () => {
    renderEditor({ canEdit: false, maxLength: 24 });

    expect(screen.getByText("Limit: 24 characters")).toBeTruthy();
  });

  it("saves a new max length", async () => {
    const { onSave } = renderEditor({ maxLength: 80 });

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "32" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(32);
  });

  it("clears the max length", async () => {
    const { onSave } = renderEditor({ maxLength: 80 });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onSave).toHaveBeenCalledWith(null);
  });
});
