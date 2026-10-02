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

import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import type { PptxSlideText } from "./content-editor-pptx-text";
import { mountPptxTextForm } from "./content-editor-pptx-text-form";

const SLIDES: PptxSlideText[] = [
  { partName: "ppt/slides/slide2.xml", units: [{ id: "ppt/slides/slide2.xml#0", text: "Cover" }] },
  { partName: "ppt/slides/slide3.xml", units: [] },
  {
    partName: "ppt/slides/slide1.xml",
    units: [
      { id: "ppt/slides/slide1.xml#0", text: "Quarterly review" },
      { id: "ppt/slides/slide1.xml#3", text: "North\nSouth" },
    ],
  },
];

describe("mountPptxTextForm", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
  });

  async function mount(options = { readOnly: false }) {
    const form = await act(async () => mountPptxTextForm(container, SLIDES, options));
    return form;
  }

  it("shows one numbered group per slide with a field per paragraph", async () => {
    await mount();

    const groups = screen.getAllByRole("listitem");
    expect(groups.map((group) => group.querySelector("span")?.textContent)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(groups.map((group) => group.querySelectorAll("textarea").length)).toEqual([1, 0, 2]);
    expect(screen.getByRole("textbox", { name: /North\s+South/ })).toHaveValue("North\nSouth");
  });

  it("reports only the fields whose text differs from the file", async () => {
    const user = userEvent.setup();
    const form = await mount();
    expect(form.getEdits()).toEqual({});

    const title = screen.getByRole("textbox", { name: "Quarterly review" });
    await user.clear(title);
    await user.type(title, "Revue{Enter}trimestrielle");
    const cover = screen.getByRole("textbox", { name: "Cover" });
    await user.type(cover, "!");
    await user.type(cover, "{Backspace}");

    expect(form.getEdits()).toEqual({ "ppt/slides/slide1.xml#0": "Revue\ntrimestrielle" });
  });

  it("lists the same fields without accepting edits when read-only", async () => {
    const user = userEvent.setup();
    const form = await mount({ readOnly: true });

    const groups = screen.getAllByRole("listitem");
    expect(groups.map((group) => group.querySelectorAll("textarea").length)).toEqual([1, 0, 2]);
    const title = screen.getByRole("textbox", { name: "Quarterly review" });
    // A read-only field, unlike a disabled one, keeps its text selectable.
    expect(title).toHaveAttribute("readonly");
    expect(title).toBeEnabled();
    await user.type(title, " 2026");

    expect(title).toHaveValue("Quarterly review");
    expect(form.getEdits()).toEqual({});
  });

  it("removes the fields when disposed", async () => {
    const form = await mount();

    await act(async () => form.dispose());

    await waitFor(() => {
      expect(container.querySelector("textarea")).toBeNull();
    });
  });
});
