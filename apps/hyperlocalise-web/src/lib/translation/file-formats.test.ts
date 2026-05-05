import { describe, expect, it } from "vite-plus/test";

import { inferSupportedTranslationFileFormat, isImageTranslationFileFormat } from "./file-formats";

describe("translation file formats", () => {
  it("infers structured translation formats from supported extensions", () => {
    expect(inferSupportedTranslationFileFormat("messages.json")).toBe("json");
    expect(inferSupportedTranslationFileFormat("messages.jsonc")).toBe("jsonc");
    expect(inferSupportedTranslationFileFormat("app.arb")).toBe("arb");
    expect(inferSupportedTranslationFileFormat("copy.xlf")).toBe("xliff");
    expect(inferSupportedTranslationFileFormat("copy.xlif")).toBe("xliff");
    expect(inferSupportedTranslationFileFormat("copy.xliff")).toBe("xliff");
    expect(inferSupportedTranslationFileFormat("messages.po")).toBe("po");
    expect(inferSupportedTranslationFileFormat("page.html")).toBe("html");
    expect(inferSupportedTranslationFileFormat("readme.md")).toBe("markdown");
    expect(inferSupportedTranslationFileFormat("page.mdx")).toBe("mdx");
    expect(inferSupportedTranslationFileFormat("Localizable.strings")).toBe("strings");
    expect(inferSupportedTranslationFileFormat("Localizable.stringsdict")).toBe("stringsdict");
    expect(inferSupportedTranslationFileFormat("copy.csv")).toBe("csv");
  });

  it("infers CLI-supported image formats separately", () => {
    expect(inferSupportedTranslationFileFormat("banner.png")).toBe("png");
    expect(inferSupportedTranslationFileFormat("banner.jpg")).toBe("jpeg");
    expect(inferSupportedTranslationFileFormat("banner.jpeg")).toBe("jpeg");
    expect(inferSupportedTranslationFileFormat("banner.webp")).toBe("webp");
    expect(isImageTranslationFileFormat("png")).toBe(true);
    expect(isImageTranslationFileFormat("json")).toBe(false);
  });

  it("rejects unsupported file extensions", () => {
    expect(inferSupportedTranslationFileFormat("brief.pdf")).toBeNull();
    expect(inferSupportedTranslationFileFormat("spreadsheet.xlsx")).toBeNull();
    expect(inferSupportedTranslationFileFormat("no-extension")).toBeNull();
  });
});
