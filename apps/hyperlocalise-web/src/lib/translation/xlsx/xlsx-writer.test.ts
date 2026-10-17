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
import * as XLSX from "xlsx";
import { describe, expect, it, vi } from "vite-plus/test";

import { isOk } from "@/lib/primitives/result/results";

import {
  buildXlsxFixture,
  cellLayoutXlsxFixture,
  multilingualXlsxFixture,
} from "./xlsx-workbook.fixture";
import { loadXlsxWorkbook, readXlsxEntries } from "./xlsx-workbook";
import { applyXlsxTranslations, patchWorksheetXml } from "./xlsx-writer";

async function apply(input: Parameters<typeof applyXlsxTranslations>[0]) {
  const result = await applyXlsxTranslations(input);
  if (!isOk(result)) {
    throw new Error(`expected a workbook, got ${JSON.stringify(result.error)}`);
  }
  return new Uint8Array(result.value);
}

async function entries(content: Uint8Array, sourceLocale: string, locale: string) {
  const workbook = await loadXlsxWorkbook(content);
  if (!isOk(workbook)) {
    throw new Error("expected a workbook");
  }
  return Object.fromEntries(
    readXlsxEntries(workbook.value, sourceLocale, locale).map(({ key, text }) => [key, text]),
  );
}

describe("applyXlsxTranslations", () => {
  it("fills an existing target column and leaves the source column alone", async () => {
    const out = await apply({
      template: multilingualXlsxFixture(),
      values: {
        "home.title": "Accueil v2",
        "home.cta": "Essai gratuit & <plus>",
        "Strings!5:5": "Pas de clé",
        missing: "ignored",
      },
      sourceLocale: "en",
      targetLocale: "fr",
    });
    expect(await entries(out, "en", "fr")).toEqual({
      "home.title": "Accueil v2",
      "home.cta": "Essai gratuit & <plus>",
      "Strings!5:5": "Pas de clé",
    });
    expect((await entries(out, "en", "en"))["home.title"]).toBe("Home");
  });

  it("clears existing non-formula target cells that have no ready value", async () => {
    const template = buildXlsxFixture([
      {
        name: "Strings",
        cells: {
          A1: "Key",
          B1: "French",
          C1: "English",
          A2: "home.title",
          B2: "Accueil",
          C2: "Home",
          A3: "home.cta",
          B3: "Ancien CTA",
          C3: "Start free trial",
          A4: "home.note",
          B4: { formula: 'CONCAT("A","B")', cached: "AB" },
          C4: "Note",
        },
      },
    ]);
    const out = await apply({
      template,
      values: { "home.cta": "Essai gratuit" },
      sourceLocale: "en",
      targetLocale: "fr",
    });
    const sheet = XLSX.read(out, { type: "array", cellFormula: true }).Sheets.Strings!;
    expect(sheet.B2).toBeUndefined();
    expect(sheet.B3?.v).toBe("Essai gratuit");
    expect(sheet.B4?.f).toBe('CONCAT("A","B")');
    expect(await entries(out, "en", "fr")).toEqual({ "home.cta": "Essai gratuit" });
  });

  it("appends a locale column after the last used column and copies the source width", async () => {
    const out = await apply({
      template: multilingualXlsxFixture(),
      values: { "home.cta": "Prueba gratis" },
      sourceLocale: "en",
      targetLocale: "es-419",
    });
    const sheet = XLSX.read(out, { type: "array" }).Sheets.Strings!;
    expect(sheet.G1?.v).toBe("es-419");
    expect(sheet.G3?.v).toBe("Prueba gratis");
    expect(sheet["!ref"]).toBe("A1:G7");
    expect(await entries(out, "en", "es-419")).toEqual({ "home.cta": "Prueba gratis" });

    const xml = await (
      await JSZip.loadAsync(out)
    )
      .file("xl/worksheets/sheet1.xml")!
      .async("string");
    const sourceWidth = /<col min="4" max="4" width="([^"]+)"/.exec(xml)?.[1];
    expect(sourceWidth).toBeDefined();
    expect(xml).toContain(`<col min="7" max="7" width="${sourceWidth}" customWidth="1"/>`);
  });

  it("produces identical bytes for identical input", async () => {
    const template = multilingualXlsxFixture();
    const input = {
      template,
      values: { "home.cta": "Essai gratuit" },
      sourceLocale: "en",
      targetLocale: "fr",
    };
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const first = await apply(input);
      vi.setSystemTime(new Date("2026-06-01T12:34:56Z"));
      expect(Buffer.from(await apply(input)).equals(Buffer.from(first))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never writes into the source column for a same-language target", async () => {
    const out = await apply({
      template: multilingualXlsxFixture(),
      values: { "home.cta": "Start your free trial" },
      sourceLocale: "en-US",
      targetLocale: "en-GB",
    });
    expect((await entries(out, "en-US", "en-US"))["home.cta"]).toBe("Start free trial");
    expect(await entries(out, "en-US", "en-GB")).toEqual({ "home.cta": "Start your free trial" });
  });

  it("replaces text cells in place for the cell layout", async () => {
    const out = await apply({
      template: cellLayoutXlsxFixture(),
      values: {
        "Pricing!A2": "Débutant",
        "Pricing!B2": "should not replace a number",
        "Pricing!B3": "should not replace a formula",
        "Lookup!A1": "should not touch hidden sheets",
        "Pricing!Z9": "should not create cells",
        "Pricing!A1": "",
      },
      sourceLocale: "en",
      targetLocale: "fr",
    });
    const workbook = XLSX.read(out, { type: "array", cellFormula: true });
    const pricing = workbook.Sheets.Pricing!;
    expect(pricing.A1?.v).toBe("Plan");
    expect(pricing.A2?.v).toBe("Débutant");
    expect(pricing.B2?.v).toBe(9);
    expect(pricing.B3?.f).toBe("B2*2");
    expect(pricing.Z9).toBeUndefined();
    expect(workbook.Sheets.Lookup!.A1?.v).toBe("Hidden text");
  });
});

describe("patchWorksheetXml", () => {
  it("copies the source style, inserts cells and rows in order, and drops stale spans", () => {
    const xml =
      `<worksheet><dimension ref="A1:B2"/><sheetData>` +
      `<row r="1" spans="1:2"><c r="A1" s="3" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>` +
      `<row r="3"><c r="A3"><v>5</v></c></row>` +
      `</sheetData></worksheet>`;
    const patched = patchWorksheetXml(xml, {
      writes: [
        { row: 0, column: 2, text: "fr", styleFromColumn: 0 },
        { row: 1, column: 2, text: "_x0041_ & ok", styleFromColumn: 0 },
      ],
      appended: { column: 2, sourceColumn: 0 },
    });
    expect(patched).toBe(
      `<worksheet><dimension ref="A1:C2"/><sheetData>` +
        `<row r="1"><c r="A1" s="3" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c>` +
        `<c r="C1" s="3" t="inlineStr"><is><t xml:space="preserve">fr</t></is></c></row>` +
        `<row r="2"><c r="C2" t="inlineStr"><is><t xml:space="preserve">_x005F_x0041_ &amp; ok</t></is></c></row>` +
        `<row r="3"><c r="A3"><v>5</v></c></row>` +
        `</sheetData></worksheet>`,
    );
  });
});
