/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { parseCsvRows } from "./parse-csv-rows";

describe("parseCsvRows", () => {
  it("parses quoted commas, escaped quotes, multiline cells, CRLF rows, and blank rows", () => {
    const rows = parseCsvRows(
      [
        "source,target,description",
        '"CTA, primary","Llamada ""principal""","Button, homepage"',
        "",
        '"Line one\nline two","Linea uno\r\nlinea dos","Keeps embedded newlines"',
        "  ,  ,  ",
      ].join("\r\n"),
    );

    expect(rows).toEqual([
      ["source", "target", "description"],
      ["CTA, primary", 'Llamada "principal"', "Button, homepage"],
      ["Line one\nline two", "Linea uno\r\nlinea dos", "Keeps embedded newlines"],
    ]);
  });
});
