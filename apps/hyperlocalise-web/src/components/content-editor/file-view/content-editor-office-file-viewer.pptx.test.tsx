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
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import { isErr } from "@/lib/primitives/result/results";

import { ContentEditorOfficeFileViewerPane } from "./content-editor-office-file-viewer";
import { applyPptxTextEdits, extractPptxSlideTexts } from "./content-editor-pptx-text";
import { buildPptxFixture } from "./content-editor-pptx-text.fixture";

const SOURCE_URL = "https://example.com/source.pptx";
const TARGET_URL = "https://example.com/target.pptx";

async function slideTexts(content: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const slides = await extractPptxSlideTexts(content);
  if (isErr(slides)) {
    throw new Error(`extract failed: ${slides.error.code}`);
  }
  return slides.value.map((slide) => slide.units.map((unit) => unit.text));
}

/** The source deck with its cover already translated. */
async function buildTranslatedFixture(): Promise<ArrayBuffer> {
  const source = await buildPptxFixture();
  const translated = await applyPptxTextEdits(source, { "ppt/slides/slide2.xml#0": "Acme SARL" });
  if (isErr(translated)) {
    throw new Error(`apply failed: ${translated.error.code}`);
  }
  const copy = new Uint8Array(translated.value.byteLength);
  copy.set(translated.value);
  return copy.buffer;
}

function renderTargetPane(input: { src: string | null; onSave: (file: File) => void }) {
  return render(
    <ContentEditorTestProviders>
      <ContentEditorOfficeFileViewerPane
        kind="pptx"
        role="target"
        src={input.src}
        seedSrc={SOURCE_URL}
        filename="quarterly-review.pptx"
        onSave={input.onSave}
      />
    </ContentEditorTestProviders>,
  );
}

describe("ContentEditorOfficeFileViewerPane with a PowerPoint file", () => {
  const fetchDeck = vi.fn<(url: string) => Promise<Response>>();

  beforeEach(() => {
    fetchDeck.mockImplementation(async (url) =>
      url === TARGET_URL
        ? new Response(await buildTranslatedFixture())
        : new Response(await buildPptxFixture()),
    );
    vi.stubGlobal("fetch", fetchDeck);
  });

  afterEach(() => {
    fetchDeck.mockReset();
    vi.unstubAllGlobals();
  });

  it("starts an untranslated target from the source deck and saves edits into it", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<(file: File) => void>();
    renderTargetPane({ src: null, onSave });

    const title = await screen.findByRole("textbox", { name: "Quarterly review" });
    expect(fetchDeck).toHaveBeenCalledWith(SOURCE_URL);
    await user.clear(title);
    await user.type(title, "Revue trimestrielle");
    await user.click(screen.getByRole("button", { name: /save edits/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const saved = onSave.mock.calls[0]![0];
    expect(saved.name).toBe("quarterly-review.pptx");
    expect(await slideTexts(await saved.arrayBuffer())).toEqual([
      ["Acme Corp"],
      [
        "Revue trimestrielle",
        "Revenue grew 12% this quarter & costs fell.",
        "Read the full report",
        "North\nSouth",
        "Plan",
        "Price",
        "Pro",
        "$10",
        "Margin formula",
      ],
    ]);
  });

  it("opens the translated deck instead of the source once one is stored", async () => {
    const onSave = vi.fn<(file: File) => void>();
    renderTargetPane({ src: TARGET_URL, onSave });

    expect(await screen.findByRole("textbox", { name: "Acme SARL" })).toHaveValue("Acme SARL");
    expect(fetchDeck).toHaveBeenCalledTimes(1);
    expect(fetchDeck).toHaveBeenCalledWith(TARGET_URL);
  });
});
