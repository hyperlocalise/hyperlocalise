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
import { describe, expect, it } from "vite-plus/test";

import {
  groupOfficeSegments,
  officeFieldText,
  officeSegmentGroup,
  officeSegmentPosition,
  officeTargetFromFieldText,
} from "./content-editor-office-segment-fields";

describe("officeSegmentGroup", () => {
  it("names slides, notes, and Word parts", () => {
    expect(officeSegmentGroup("ppt/slides/slide12.xml#0")).toEqual({
      id: "ppt/slides/slide12.xml",
      kind: "slide",
      number: 12,
    });
    expect(officeSegmentGroup("ppt/notesSlides/notesSlide2.xml#1").kind).toBe("notes");
    expect(officeSegmentGroup("word/document.xml#4").kind).toBe("document");
    expect(officeSegmentGroup("word/footer3.xml#0")).toMatchObject({ kind: "footer", number: 3 });
    expect(officeSegmentGroup("word/glossary/document.xml#0")).toMatchObject({
      kind: "other",
      name: "word/glossary/document.xml",
    });
  });

  it("groups workbook keys by sheet, including sheet names with a hash", () => {
    expect(officeSegmentGroup("Pricing #2!B3")).toEqual({
      id: "sheet:Pricing #2",
      kind: "sheet",
      name: "Pricing #2",
    });
    expect(officeSegmentPosition("Pricing #2!B3")).toEqual({ cell: "B3" });
    expect(officeSegmentPosition("Strings!4:4")).toEqual({ cell: "4:4" });
    expect(officeSegmentGroup("checkout.title")).toEqual({ id: "other", kind: "other" });
  });

  it("numbers paragraphs from one", () => {
    expect(officeSegmentPosition("word/document.xml#0")).toEqual({ paragraph: 1 });
  });
});

describe("groupOfficeSegments", () => {
  it("keeps file order and starts a new run when the part changes", () => {
    const runs = groupOfficeSegments([
      { key: "ppt/slides/slide1.xml#0" },
      { key: "ppt/slides/slide1.xml#1" },
      { key: "ppt/slides/slide2.xml#0" },
      { key: "ppt/slides/slide1.xml#2" },
    ]);

    expect(runs.map((run) => [run.group.number, run.segments.length])).toEqual([
      [1, 2],
      [2, 1],
      [1, 1],
    ]);
  });
});

describe("office field text", () => {
  const open = "\x1eHLOXPH_6F30_0\x1f";
  const close = "\x1eHLOXPH_6330_1\x1f";
  const source = `Read the ${open}terms${close} first.`;

  it("round-trips formatting tokens through their labels", () => {
    const field = officeFieldText(`Lisez les ${open}conditions${close}.`);

    expect(field).toBe("Lisez les OX#0conditionsOX#1.");
    expect(officeTargetFromFieldText(field, source)).toBe(`Lisez les ${open}conditions${close}.`);
  });

  it("keeps labels the source does not define so QA can flag them", () => {
    expect(officeTargetFromFieldText("OX#0 OX#7", source)).toBe(`${open} OX#7`);
    expect(officeTargetFromFieldText("Plain OX#0", "Plain")).toBe("Plain OX#0");
  });

  it("keeps digits typed straight after a label", () => {
    expect(officeTargetFromFieldText("OX#010 jours", source)).toBe(`${open}10 jours`);
  });
});
