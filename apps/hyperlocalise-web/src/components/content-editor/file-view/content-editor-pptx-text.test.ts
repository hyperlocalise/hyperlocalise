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
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { describe, expect, it } from "vite-plus/test";

import { isErr } from "@/lib/primitives/result/results";

import { applyPptxTextEdits, extractPptxSlideTexts } from "./content-editor-pptx-text";
import {
  PPTX_FIXTURE_CONTENT_SLIDE,
  PPTX_FIXTURE_ENTRIES,
  buildPptxFixture,
} from "./content-editor-pptx-text.fixture";

const CONTENT_SLIDE_PART = "ppt/slides/slide1.xml";

async function readEntries(archive: Uint8Array | ArrayBuffer): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(archive);
  const entries: Record<string, string> = {};
  for (const [name, file] of Object.entries(zip.files)) {
    entries[name] = await file.async("string");
  }
  return entries;
}

/** The text of every slide, in presentation order. */
async function extractTexts(archive: Uint8Array | ArrayBuffer): Promise<string[][]> {
  const slides = await extractPptxSlideTexts(archive);
  if (isErr(slides)) {
    throw new Error(`extract failed: ${slides.error.code}`);
  }
  return slides.value.map((slide) => slide.units.map((unit) => unit.text));
}

/** Edits each paragraph whose current text is a key of `byText`. */
async function edit(
  archive: Uint8Array | ArrayBuffer,
  byText: Record<string, string>,
): Promise<Uint8Array> {
  const slides = await extractPptxSlideTexts(archive);
  if (isErr(slides)) {
    throw new Error(`extract failed: ${slides.error.code}`);
  }
  const edits = Object.fromEntries(
    slides.value
      .flatMap((slide) => slide.units)
      .flatMap((unit) => (unit.text in byText ? [[unit.id, byText[unit.text]!]] : [])),
  );
  const applied = await applyPptxTextEdits(archive, edits);
  if (isErr(applied)) {
    throw new Error(`apply failed: ${applied.error.code}`);
  }
  return applied.value;
}

describe("extractPptxSlideTexts", () => {
  it("records the shape and the top-level object each paragraph belongs to", async () => {
    const slides = await extractPptxSlideTexts(await buildPptxFixture());
    if (isErr(slides)) {
      throw new Error(`extract failed: ${slides.error.code}`);
    }

    const content = slides.value.find((slide) => slide.partName === CONTENT_SLIDE_PART);
    expect(
      content?.units.map((unit) => [unit.text.split("\n")[0], unit.shapeId, unit.elementIndex]),
    ).toEqual([
      ["Quarterly review", "2", 0],
      ["Revenue grew 12% this quarter & costs fell.", "3", 1],
      ["Read the full report", "3", 1],
      ["North", "3", 1],
      // Table cells share the table frame's id; objects without text still count.
      ["Plan", "6", 4],
      ["Price", "6", 4],
      ["Pro", "6", 4],
      ["$10", "6", 4],
      // A shape that does not name itself has no id of its own.
      ["Margin formula", null, 5],
    ]);
  });

  it("lists slide paragraphs with visible text, in presentation order", async () => {
    const slides = await extractPptxSlideTexts(await buildPptxFixture());
    if (isErr(slides)) {
      throw new Error(`extract failed: ${slides.error.code}`);
    }

    // The cover is stored as slide2.xml but listed first in the presentation.
    expect(slides.value.map((slide) => slide.partName)).toEqual([
      "ppt/slides/slide2.xml",
      CONTENT_SLIDE_PART,
    ]);
    // Notes, layouts, charts, the slide number, empty paragraphs, and fallback copies are
    // left out.
    expect(slides.value.map((slide) => slide.units.map((unit) => unit.text))).toEqual([
      ["Acme Corp"],
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
      ],
    ]);
  });

  it("reads table cells without their markup", async () => {
    const pptx = new PptxGenJS();
    const page = pptx.addSlide();
    page.addText("Pricing", { x: 0.5, y: 0.5, w: 9, h: 1 });
    page.addTable(
      [
        [{ text: "Plan" }, { text: "Price" }],
        [{ text: "Pro" }, { text: "$10" }],
      ],
      { x: 0.5, y: 2, w: 6 },
    );
    const deck = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;

    expect(await extractTexts(deck)).toEqual([["Pricing", "Plan", "Price", "Pro", "$10"]]);
  });

  it("reads slides that bind DrawingML and PresentationML to other prefixes", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/presentation.xml",
      `<pres:presentation xmlns:pres="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:rel="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><pres:sldIdLst><pres:sldId id="256" rel:id="rId2"/></pres:sldIdLst></pres:presentation>`,
    );
    zip.file(
      "ppt/_rels/presentation.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`,
    );
    zip.file(
      "ppt/slides/slide1.xml",
      `<pres:sld xmlns:pres="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:d="http://schemas.openxmlformats.org/drawingml/2006/main"><pres:cSld><pres:spTree><pres:sp><pres:nvSpPr><pres:cNvPr id="2" name="Title"/></pres:nvSpPr><pres:spPr/><pres:txBody><d:p><d:r><d:rPr lang="en-US"/><d:t>Hello</d:t></d:r></d:p></pres:txBody></pres:sp></pres:spTree></pres:cSld></pres:sld>`,
    );
    const deck = await zip.generateAsync({ type: "uint8array" });

    expect(await extractTexts(deck)).toEqual([["Hello"]]);
    const saved = await edit(deck, { Hello: "Bonjour" });
    expect(await extractTexts(saved)).toEqual([["Bonjour"]]);
    expect((await readEntries(saved))["ppt/slides/slide1.xml"]).toContain("<d:t>Bonjour</d:t>");
    expect((await readEntries(saved))["ppt/slides/slide1.xml"]).not.toContain("<a:t>");
  });

  it("does not treat markup inside comments as slide text", async () => {
    const zip = new JSZip();
    zip.file("ppt/presentation.xml", "<p:presentation/>");
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld><p:cSld><p:spTree><!-- <a:p><a:r><a:t>Commented</a:t></a:r></a:p> --><p:sp><p:spPr/><p:txBody><a:p><a:r><a:t>Visible</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    );
    const deck = await zip.generateAsync({ type: "uint8array" });

    expect(await extractTexts(deck)).toEqual([["Visible"]]);
    const slide = (await readEntries(await edit(deck, { Visible: "Vu" })))["ppt/slides/slide1.xml"];
    expect(slide).toContain("<!-- <a:p><a:r><a:t>Commented</a:t></a:r></a:p> -->");
    expect(slide).toContain("<a:t>Vu</a:t>");
  });

  it("falls back to part numbers when the presentation lists no slides", async () => {
    const zip = new JSZip();
    zip.file("ppt/presentation.xml", "<p:presentation/>");
    for (const number of [10, 2, 1]) {
      zip.file(
        `ppt/slides/slide${number}.xml`,
        `<p:sld><a:p><a:r><a:t>Slide ${number}</a:t></a:r></a:p></p:sld>`,
      );
    }

    expect(await extractTexts(await zip.generateAsync({ type: "uint8array" }))).toEqual([
      ["Slide 1"],
      ["Slide 2"],
      ["Slide 10"],
    ]);
  });

  it("rejects content that is not a PowerPoint package", async () => {
    const notZip = await extractPptxSlideTexts(Buffer.from("not a zip"));
    expect(isErr(notZip) && notZip.error.code).toBe("invalid_pptx");

    const zip = new JSZip();
    zip.file("word/document.xml", "<w:document/>");
    const otherPackage = await extractPptxSlideTexts(
      await zip.generateAsync({ type: "uint8array" }),
    );
    expect(isErr(otherPackage) && otherPackage.error.code).toBe("invalid_pptx");
  });
});

describe("applyPptxTextEdits", () => {
  it("returns every part unchanged when nothing was edited", async () => {
    const saved = await edit(await buildPptxFixture(), {});

    expect(await readEntries(saved)).toEqual(PPTX_FIXTURE_ENTRIES);
  });

  it("rewrites only the edited paragraph and keeps the rest of the package", async () => {
    const saved = await edit(await buildPptxFixture(), {
      "Quarterly review": "Revue trimestrielle",
    });

    const entries = await readEntries(saved);
    expect(entries[CONTENT_SLIDE_PART]).toBe(
      PPTX_FIXTURE_CONTENT_SLIDE.replace(
        "<a:t>Quarterly review</a:t>",
        "<a:t>Revue trimestrielle</a:t>",
      ),
    );
    expect({ ...entries, [CONTENT_SLIDE_PART]: PPTX_FIXTURE_CONTENT_SLIDE }).toEqual(
      PPTX_FIXTURE_ENTRIES,
    );
  });

  it("keeps the formatting of the run that held most of the text", async () => {
    const saved = await edit(await buildPptxFixture(), {
      "Revenue grew 12% this quarter & costs fell.": "Le chiffre d'affaires <a> augmenté & baissé",
      "Read the full report": "Lire le rapport",
    });

    const slide = (await readEntries(saved))[CONTENT_SLIDE_PART];
    // The longest run keeps its properties; the bold run and its text are gone.
    expect(slide).toContain(
      `<a:p><a:r><a:rPr lang="en-US" sz="1800"/><a:t>Le chiffre d'affaires &lt;a&gt; augmenté &amp; baissé</a:t></a:r></a:p>`,
    );
    // The link run is longer, but a run outside the link receives the text.
    expect(slide).toContain(
      `<a:p><a:r><a:rPr lang="en-US"/><a:t>Lire le rapport</a:t></a:r></a:p>`,
    );
    expect(slide).not.toContain("a:hlinkClick");
  });

  it("writes each line of an edited paragraph as a line break", async () => {
    const saved = await edit(await buildPptxFixture(), {
      "North\nSouth": "Nord\r\nSud\n\nEst",
      Plan: "",
    });

    const slide = (await readEntries(saved))[CONTENT_SLIDE_PART];
    const run = (text: string) => `<a:r><a:rPr lang="en-US" sz="1400"/><a:t>${text}</a:t></a:r>`;
    expect(slide).toContain(
      `<a:p>${run("Nord")}<a:br/>${run("Sud")}<a:br/><a:br/>${run("Est")}</a:p>`,
    );
    // A cleared cell keeps its paragraph and cell properties.
    expect(slide).toContain(`<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p></a:p></a:txBody>`);
    expect((await extractTexts(saved))[1]).toEqual([
      "Quarterly review",
      "Revenue grew 12% this quarter & costs fell.",
      "Read the full report",
      "Nord\nSud\n\nEst",
      "Price",
      "Pro",
      "$10",
      "Margin formula",
    ]);
  });

  it("turns pasted line separators into line breaks and drops control characters", async () => {
    const verticalTab = String.fromCharCode(0x0b);
    const bell = String.fromCharCode(0x07);
    const saved = await edit(await buildPptxFixture(), {
      Pro: `Pro${verticalTab}Plus${bell}\ttier`,
    });

    expect((await extractTexts(saved))[1]).toContain("Pro\nPlus\ttier");
  });

  it("edits table cells and both copies of an alternate-content paragraph", async () => {
    const saved = await edit(await buildPptxFixture(), {
      Price: "Prix",
      "Margin formula": "Formule de marge",
    });

    const slide = (await readEntries(saved))[CONTENT_SLIDE_PART] ?? "";
    expect(slide).toContain(`<a:t>Prix</a:t>`);
    expect(slide).toContain(
      `<mc:Choice Requires="a14"><p:sp><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>Formule de marge</a:t>`,
    );
    expect(slide).toContain(
      `<mc:Fallback><p:sp><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>Formule de marge</a:t>`,
    );
    expect(slide.length).toBe(
      PPTX_FIXTURE_CONTENT_SLIDE.length +
        "Prix".length -
        "Price".length +
        2 * ("Formule de marge".length - "Margin formula".length),
    );
  });

  it("keeps shapes, tables, and backgrounds of a generated deck", async () => {
    const pptx = new PptxGenJS();
    const page = pptx.addSlide();
    page.background = { color: "112233" };
    page.addText("Pricing", { x: 0.5, y: 0.5, w: 9, h: 1, fontSize: 32, bold: true });
    page.addText("Billed monthly", { x: 0.5, y: 1.6, w: 9, h: 1, fontSize: 14 });
    page.addShape(pptx.ShapeType.rect, { x: 7, y: 3, w: 2, h: 1, fill: { color: "FFCC00" } });
    page.addTable([[{ text: "Plan" }, { text: "Price" }]], { x: 0.5, y: 3, w: 6 });
    const deck = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;

    const saved = await edit(deck, { Pricing: "Tarifs", Plan: "Offre" });

    expect(await extractTexts(saved)).toEqual([["Tarifs", "Billed monthly", "Offre", "Price"]]);
    const before = await readEntries(deck);
    const after = await readEntries(saved);
    expect(Object.keys(after)).toEqual(Object.keys(before));
    const slidePart = "ppt/slides/slide1.xml";
    expect(after[slidePart]).toBe(
      before[slidePart]
        ?.replace("<a:t>Pricing</a:t>", "<a:t>Tarifs</a:t>")
        .replace("<a:t>Plan</a:t>", "<a:t>Offre</a:t>"),
    );
    expect({ ...after, [slidePart]: before[slidePart] }).toEqual(before);
  });

  it("ignores edits for paragraphs the package does not have", async () => {
    const deck = await buildPptxFixture();
    const applied = await applyPptxTextEdits(deck, {
      "ppt/slides/slide1.xml#99": "Orphan",
      "ppt/notesSlides/notesSlide1.xml#0": "Notes are not editable",
    });
    if (isErr(applied)) {
      throw new Error(`apply failed: ${applied.error.code}`);
    }

    expect(await readEntries(applied.value)).toEqual(PPTX_FIXTURE_ENTRIES);
  });
});
