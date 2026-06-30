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
