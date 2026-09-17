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
  decodeMemoryImportBytes,
  memoryImportFormatFromFilename,
  suggestedMemoryNameFromFilename,
} from "./decode-import-file";

const SAMPLE = '<?xml version="1.0"?><tmx version="1.4"><body/></tmx>';

function utf16LeWithBom(text: string) {
  const encoded = Buffer.from(text, "utf16le");
  return Uint8Array.from([0xff, 0xfe, ...encoded]);
}

function utf16BeWithBom(text: string) {
  const body = Buffer.alloc(text.length * 2);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    body[index * 2] = (code >> 8) & 0xff;
    body[index * 2 + 1] = code & 0xff;
  }
  return Uint8Array.from([0xfe, 0xff, ...body]);
}

describe("decodeMemoryImportBytes", () => {
  it("decodes UTF-16 LE and BE TMX files from their BOM", () => {
    expect(decodeMemoryImportBytes(utf16LeWithBom(SAMPLE)).replace(/^\uFEFF/, "")).toBe(SAMPLE);
    expect(decodeMemoryImportBytes(utf16BeWithBom(SAMPLE)).replace(/^\uFEFF/, "")).toBe(SAMPLE);
  });

  it("keeps UTF-8 TMX unchanged", () => {
    expect(decodeMemoryImportBytes(new TextEncoder().encode(SAMPLE))).toBe(SAMPLE);
  });
});

describe("memoryImportFormatFromFilename", () => {
  it("recognizes TMX and CSV extensions", () => {
    expect(memoryImportFormatFromFilename("launch.tmx")).toBe("tmx");
    expect(memoryImportFormatFromFilename("Launch.TMX")).toBe("tmx");
    expect(memoryImportFormatFromFilename("rows.csv")).toBe("csv");
    expect(memoryImportFormatFromFilename("notes.txt")).toBeNull();
  });
});

describe("suggestedMemoryNameFromFilename", () => {
  it("strips the interchange extension and path", () => {
    expect(suggestedMemoryNameFromFilename("../folder\\Marketing Launch.tmx")).toBe(
      "Marketing Launch",
    );
    expect(suggestedMemoryNameFromFilename("rows.csv")).toBe("rows");
  });
});
