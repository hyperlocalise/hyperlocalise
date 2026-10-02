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
import { describe, expect, it, vi } from "vite-plus/test";

import { BuildTextUtils } from "@univerjs/core";
import { Document, Packer, Paragraph } from "docx";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";

import { isErr } from "@/lib/primitives/result/results";

import {
  emptyOfficeSnapshot,
  exportOfficeSnapshotToFile,
  loadOfficeSnapshotFromFile,
  plainTextFromDocument,
  plainTextsFromSlide,
} from "./content-editor-office-convert";
import { extractPptxSlideTexts } from "./content-editor-pptx-text";
import { PPTX_FIXTURE_ENTRIES, buildPptxFixture } from "./content-editor-pptx-text.fixture";

// Tests load mammoth's Node build, which reads `buffer` where the browser build reads `arrayBuffer`.
vi.mock("mammoth", async (importOriginal) => {
  const { default: mammoth } = await importOriginal<{ default: typeof import("mammoth") }>();
  return {
    default: {
      ...mammoth,
      extractRawText: (input: { arrayBuffer: ArrayBuffer }) =>
        mammoth.extractRawText({ buffer: Buffer.from(input.arrayBuffer) }),
    },
  };
});

const PPTX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

async function loadPptxFixtureSnapshot() {
  const snapshot = await loadOfficeSnapshotFromFile({
    kind: "pptx",
    file: new File([await buildPptxFixture()], "quarterly-review.pptx", { type: PPTX_MIME_TYPE }),
  });
  if (snapshot.kind !== "pptx" || !snapshot.base) {
    throw new Error("expected a pptx snapshot read from a file");
  }
  return { snapshot, base: snapshot.base };
}

async function slideTextsOfFile(file: File): Promise<string[][]> {
  const slides = await extractPptxSlideTexts(await file.arrayBuffer());
  if (isErr(slides)) {
    throw new Error(`extract failed: ${slides.error.code}`);
  }
  return slides.value.map((slide) => slide.units.map((unit) => unit.text));
}

describe("cat-office-convert", () => {
  it("builds empty snapshots for each office kind", () => {
    expect(emptyOfficeSnapshot("docx", "brief.docx").kind).toBe("docx");
    expect(emptyOfficeSnapshot("xlsx", "rates.xlsx").kind).toBe("xlsx");
    expect(emptyOfficeSnapshot("pptx", "deck.pptx").kind).toBe("pptx");
  });

  it("exports a docx file from a document snapshot", async () => {
    const snapshot = emptyOfficeSnapshot("docx", "brief.docx");
    if (snapshot.kind !== "docx") {
      throw new Error("expected docx snapshot");
    }
    snapshot.data.body = BuildTextUtils.transform.fromPlainText("Hello from CAT");

    const file = await exportOfficeSnapshotToFile({
      snapshot,
      filename: "brief.docx",
    });

    expect(file.name).toBe("brief.docx");
    expect(file.type).toContain("wordprocessingml");
    expect(file.size).toBeGreaterThan(0);
  });

  it("loads paragraph text from a docx file", async () => {
    const buffer = await Packer.toBuffer(
      new Document({
        sections: [{ children: [new Paragraph("Quarterly brief"), new Paragraph("Hello world")] }],
      }),
    );

    const snapshot = await loadOfficeSnapshotFromFile({
      kind: "docx",
      file: new File([new Uint8Array(buffer)], "brief.docx"),
    });

    if (snapshot.kind !== "docx") {
      throw new Error("expected docx snapshot");
    }
    const text = plainTextFromDocument(snapshot.data);
    expect(text).toContain("Quarterly brief");
    expect(text).toContain("Hello world");
  });

  it("builds a plain pptx file from a slide snapshot that has no file", async () => {
    const snapshot = emptyOfficeSnapshot("pptx", "deck.pptx");
    const file = await exportOfficeSnapshotToFile({
      snapshot,
      filename: "deck.pptx",
    });

    expect(file.name).toBe("deck.pptx");
    expect(file.type).toContain("presentationml");
    expect(file.size).toBeGreaterThan(0);
  });

  it("imports slide text from a generated pptx file", async () => {
    const pptx = new PptxGenJS();
    const page = pptx.addSlide();
    page.addText("Localization progress", { x: 0.5, y: 0.6, w: 9, h: 1, fontSize: 28, bold: true });
    page.addText("Q1 review for customer-facing strings and assets.", {
      x: 0.5,
      y: 1.8,
      w: 9,
      h: 3,
      fontSize: 18,
    });
    const buffer = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
    const file = new File([buffer], "quarterly-review.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    const snapshot = await loadOfficeSnapshotFromFile({
      kind: "pptx",
      file,
      title: "quarterly-review.pptx",
    });

    expect(snapshot.kind).toBe("pptx");
    if (snapshot.kind !== "pptx") {
      throw new Error("expected pptx snapshot");
    }

    const slideText = snapshot.data.body?.pageOrder
      .map((pageId) => {
        const pageData = snapshot.data.body?.pages[pageId];
        if (!pageData) {
          return "";
        }
        return Object.values(pageData.pageElements)
          .map((element) => element.richText?.text?.trim() || "")
          .filter(Boolean)
          .join("\n");
      })
      .join("\n");

    expect(slideText).toContain("Localization progress");
    expect(slideText).toContain("Q1 review for customer-facing strings and assets.");
  });

  it("shows one text box per slide, in presentation order, without table markup", async () => {
    const { snapshot, base } = await loadPptxFixtureSnapshot();

    expect(plainTextsFromSlide(snapshot.data)).toEqual([
      "Acme Corp",
      [
        "Quarterly review",
        "Revenue grew 12% this quarter & costs fell.",
        "Read the full report",
        "North\nSouth",
        "Plan",
        "Price",
        "Pro",
        "$10",
        "Margin formula",
      ].join("\n"),
    ]);
    expect(base.slides.map((slide) => slide.units.length)).toEqual([1, 9]);
  });

  it("leaves a slide without text blank", async () => {
    const pptx = new PptxGenJS();
    pptx.addSlide().addText("Cover", { x: 0.5, y: 0.5, w: 9, h: 1 });
    pptx.addSlide();
    const buffer = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;

    const snapshot = await loadOfficeSnapshotFromFile({
      kind: "pptx",
      file: new File([buffer], "deck.pptx", { type: PPTX_MIME_TYPE }),
    });

    if (snapshot.kind !== "pptx") {
      throw new Error("expected pptx snapshot");
    }
    const pages = snapshot.data.body?.pageOrder.map((pageId) => snapshot.data.body?.pages[pageId]);
    expect(pages?.map((page) => Object.keys(page?.pageElements ?? {}).length)).toEqual([1, 0]);
  });

  it("rejects a pptx file that cannot be read", async () => {
    await expect(
      loadOfficeSnapshotFromFile({ kind: "pptx", file: new File(["not a deck"], "deck.pptx") }),
    ).rejects.toThrow("This PowerPoint file could not be read");
  });

  it("saves an unedited pptx snapshot as the file it was read from", async () => {
    const { snapshot } = await loadPptxFixtureSnapshot();

    const file = await exportOfficeSnapshotToFile({ snapshot, filename: "quarterly-review.pptx" });

    expect(file.name).toBe("quarterly-review.pptx");
    expect(file.type).toBe(PPTX_MIME_TYPE);
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries: Record<string, string> = {};
    for (const [name, entry] of Object.entries(zip.files)) {
      entries[name] = await entry.async("string");
    }
    expect(entries).toEqual(PPTX_FIXTURE_ENTRIES);
  });

  it("writes edited slide text back and reads it again", async () => {
    const { snapshot, base } = await loadPptxFixtureSnapshot();
    const [cover, content] = base.slides;
    const edits = {
      [cover!.units[0]!.id]: "Acme SARL",
      [content!.units[0]!.id]: "Revue trimestrielle",
      [content!.units[5]!.id]: "Prix",
    };

    const file = await exportOfficeSnapshotToFile({
      snapshot: { ...snapshot, edits },
      filename: "quarterly-review.pptx",
    });

    expect(await slideTextsOfFile(file)).toEqual([
      ["Acme SARL"],
      [
        "Revue trimestrielle",
        "Revenue grew 12% this quarter & costs fell.",
        "Read the full report",
        "North\nSouth",
        "Plan",
        "Prix",
        "Pro",
        "$10",
        "Margin formula",
      ],
    ]);

    // The saved file opens as the next base, so a second save builds on the first.
    const reloaded = await loadOfficeSnapshotFromFile({ kind: "pptx", file });
    if (reloaded.kind !== "pptx" || !reloaded.base) {
      throw new Error("expected a pptx snapshot read from a file");
    }
    const second = await exportOfficeSnapshotToFile({
      snapshot: { ...reloaded, edits: { [reloaded.base.slides[1]!.units[4]!.id]: "Offre" } },
      filename: "quarterly-review.pptx",
    });
    expect((await slideTextsOfFile(second))[1]?.slice(0, 6)).toEqual([
      "Revue trimestrielle",
      "Revenue grew 12% this quarter & costs fell.",
      "Read the full report",
      "North\nSouth",
      "Offre",
      "Prix",
    ]);
  });
});
