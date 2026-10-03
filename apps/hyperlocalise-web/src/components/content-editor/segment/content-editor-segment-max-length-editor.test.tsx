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

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  ContentEditorSegmentMaxLengthEditor,
  parseMaxLengthDraft,
} from "./content-editor-segment-max-length-editor";

function renderEditor(
  overrides: Partial<Parameters<typeof ContentEditorSegmentMaxLengthEditor>[0]> = {},
) {
  const onSave = vi.fn().mockResolvedValue(undefined);

  render(
    <IntlProvider locale="en">
      <ContentEditorSegmentMaxLengthEditor maxLength={80} canEdit onSave={onSave} {...overrides} />
    </IntlProvider>,
  );

  return { onSave };
}

describe("parseMaxLengthDraft", () => {
  it("accepts whole numbers within the supported range", () => {
    expect(parseMaxLengthDraft("32")).toBe(32);
    expect(parseMaxLengthDraft("100000")).toBe(100_000);
  });

  it("rejects partial numeric prefixes and out-of-range values", () => {
    expect(parseMaxLengthDraft("12.5")).toBeNull();
    expect(parseMaxLengthDraft("1e2")).toBeNull();
    expect(parseMaxLengthDraft("100001")).toBeNull();
    expect(parseMaxLengthDraft("0")).toBeNull();
  });
});

describe("ContentEditorSegmentMaxLengthEditor", () => {
  it("shows the current limit in read-only mode", () => {
    renderEditor({ canEdit: false, maxLength: 24 });

    expect(screen.getByText("Limit: 24 characters")).toBeTruthy();
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("keeps an input visible when no limit is set", () => {
    renderEditor({ maxLength: undefined });

    expect(screen.getByRole("spinbutton", { name: "Character limit" })).toHaveValue(null);
    expect(screen.getByPlaceholderText("e.g. 32")).toBeTruthy();
  });

  it("saves a new max length from the Save button", async () => {
    const { onSave } = renderEditor({ maxLength: 80 });

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "32" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(32);
    });
  });

  it("saves on blur and Enter", async () => {
    const { onSave } = renderEditor({ maxLength: undefined });
    const input = screen.getByRole("spinbutton");

    fireEvent.change(input, { target: { value: "24" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(24);
    });

    onSave.mockClear();
    fireEvent.change(input, { target: { value: "40" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(40);
    });
  });

  it("rejects decimal and scientific-notation drafts", async () => {
    const { onSave } = renderEditor({ maxLength: 80 });

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "12.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a whole number from 1 to 100,000.")).toBeTruthy();
  });

  it("surfaces save failures while keeping the draft", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Network request failed"));
    render(
      <IntlProvider locale="en">
        <ContentEditorSegmentMaxLengthEditor maxLength={80} canEdit onSave={onSave} />
      </IntlProvider>,
    );

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "32" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Network request failed")).toBeTruthy();
    });
    expect(screen.getByRole("spinbutton")).toHaveValue(32);
  });

  it("clears the max length", async () => {
    const { onSave } = renderEditor({ maxLength: 80 });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(null);
    });
  });

  it("clears an edited draft without saving the typed limit first", async () => {
    const { onSave } = renderEditor({ maxLength: 80 });
    const input = screen.getByRole("spinbutton");
    const clear = screen.getByRole("button", { name: "Clear" });

    fireEvent.change(input, { target: { value: "32" } });
    fireEvent.blur(input, { relatedTarget: clear });
    fireEvent.click(clear);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(null);
    });
    expect(onSave).not.toHaveBeenCalledWith(32);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("still saves after Clear when the input was not focused", async () => {
    const { onSave } = renderEditor({ maxLength: 80 });
    const input = screen.getByRole("spinbutton");
    const clear = screen.getByRole("button", { name: "Clear" });

    fireEvent.pointerDown(clear);
    fireEvent.click(clear);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(null);
    });
    onSave.mockClear();

    fireEvent.change(input, { target: { value: "32" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(32);
    });
  });

  it("shows how many characters are already used", () => {
    renderEditor({ maxLength: 20, characterCount: 28 });

    expect(screen.getByText("28 used")).toBeTruthy();
  });
});
