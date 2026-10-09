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
  getLocaleScanExtensions,
  getSupportedFileTranslationAccept,
  getSupportedSourceUploadAccept,
  inferSupportedFileTranslationFileFormat,
  inferSupportedImageTranslationFileFormat,
  inferSupportedOfficeTranslationFileFormat,
  inferSupportedSourceUploadFormat,
  inferSupportedTranslationFileFormat,
  isBinaryTranslationFileFormat,
  inferSupportedDocumentTranslationFileFormat,
  isDocumentTranslationFileFormat,
  isImageTranslationFileFormat,
  isOfficeTranslationFileFormat,
  isSupportedFileTranslationFileFormat,
  isSupportedSourceUploadFormat,
  isVideoTranslationFileFormat,
  isWholeFileTranslationFileFormat,
  looksLikeImageUrl,
  looksLikeVideoUrl,
} from "./file-formats";

describe("translation file formats", () => {
  it("infers structured translation formats from supported extensions", () => {
    expect(inferSupportedTranslationFileFormat("messages.json")).toBe("json");
    expect(inferSupportedTranslationFileFormat("messages.jsonc")).toBe("jsonc");
    expect(inferSupportedTranslationFileFormat("messages.yaml")).toBe("yaml");
    expect(inferSupportedTranslationFileFormat("messages.yml")).toBe("yaml");
    expect(inferSupportedFileTranslationFileFormat("messages.yaml")).toBe("yaml");
    expect(inferSupportedFileTranslationFileFormat("messages.yml")).toBe("yaml");
    expect(inferSupportedTranslationFileFormat("app.arb")).toBe("arb");
    expect(inferSupportedTranslationFileFormat("copy.xlf")).toBe("xliff");
    expect(inferSupportedTranslationFileFormat("copy.xlif")).toBe("xliff");
    expect(inferSupportedTranslationFileFormat("copy.xliff")).toBe("xliff");
    expect(inferSupportedTranslationFileFormat("messages.po")).toBe("po");
    expect(inferSupportedTranslationFileFormat("translations/app_de.ts")).toBe("qt-ts");
    expect(inferSupportedFileTranslationFileFormat("app_fr.ts")).toBe("qt-ts");
    expect(inferSupportedTranslationFileFormat("page.html")).toBe("html");
    expect(inferSupportedTranslationFileFormat("readme.md")).toBe("markdown");
    expect(inferSupportedTranslationFileFormat("page.mdx")).toBe("mdx");
    expect(inferSupportedTranslationFileFormat("guide.adoc")).toBe("asciidoc");
    expect(inferSupportedTranslationFileFormat("manual.asciidoc")).toBe("asciidoc");
    expect(inferSupportedTranslationFileFormat("notes.asc")).toBe("asciidoc");
    expect(inferSupportedFileTranslationFileFormat("guide.adoc")).toBe("asciidoc");
    expect(inferSupportedTranslationFileFormat("Localizable.strings")).toBe("strings");
    expect(inferSupportedTranslationFileFormat("Localizable.stringsdict")).toBe("stringsdict");
    expect(inferSupportedTranslationFileFormat("Localizable.xcstrings")).toBe("xcstrings");
    expect(inferSupportedFileTranslationFileFormat("Localizable.xcstrings")).toBe("xcstrings");
    expect(inferSupportedTranslationFileFormat("copy.csv")).toBe("csv");
    expect(inferSupportedTranslationFileFormat("copy.tsv")).toBe("tsv");
    expect(inferSupportedFileTranslationFileFormat("copy.tsv")).toBe("tsv");
    expect(inferSupportedTranslationFileFormat("messages.toml")).toBe("toml");
    expect(inferSupportedFileTranslationFileFormat("messages.toml")).toBe("toml");
    expect(inferSupportedSourceUploadFormat("locales/en.toml")).toBe("toml");
    expect(inferSupportedTranslationFileFormat("messages.ini")).toBe("ini");
    expect(inferSupportedFileTranslationFileFormat("messages.ini")).toBe("ini");
    expect(inferSupportedSourceUploadFormat("locales/en.ini")).toBe("ini");
    expect(isSupportedSourceUploadFormat("messages.ini")).toBe(true);
    expect(inferSupportedTranslationFileFormat("res/values/strings.xml")).toBe("xml");
    expect(inferSupportedFileTranslationFileFormat("res/values/strings.xml")).toBe("xml");
    expect(inferSupportedSourceUploadFormat("Resources.resx")).toBe("resx");
    expect(inferSupportedSourceUploadFormat("Strings/en-US/Resources.resw")).toBe("resw");
    expect(inferSupportedSourceUploadFormat("messages_en.properties")).toBe("properties");
    expect(inferSupportedSourceUploadFormat("lang/en/messages.php")).toBe("php");
    expect(inferSupportedSourceUploadFormat("locales/en.ftl")).toBe("ftl");
    expect(inferSupportedSourceUploadFormat("locales/en.ts")).toBe("qt-ts");
    expect(inferSupportedSourceUploadFormat("locales/en.tsx")).toBe("javascript");
    expect(inferSupportedSourceUploadFormat("locales/en.js")).toBe("javascript");
    expect(inferSupportedSourceUploadFormat("sections/header.liquid")).toBe("liquid");
    expect(inferSupportedSourceUploadFormat("page.htm")).toBe("html");
    expect(inferSupportedSourceUploadFormat("notes.markdown")).toBe("markdown");
    expect(isSupportedSourceUploadFormat("messages.properties")).toBe(true);
    expect(isSupportedFileTranslationFileFormat("xml")).toBe(true);
    expect(isSupportedFileTranslationFileFormat("javascript")).toBe(true);
    expect(inferSupportedTranslationFileFormat("captions.srt")).toBe("srt");
    expect(inferSupportedTranslationFileFormat("captions.vtt")).toBe("vtt");
    expect(inferSupportedTranslationFileFormat("captions.sbv")).toBe("sbv");
    expect(inferSupportedTranslationFileFormat("mark.svg")).toBe("svg");
    expect(inferSupportedFileTranslationFileFormat("captions.srt")).toBe("srt");
    expect(inferSupportedFileTranslationFileFormat("captions.vtt")).toBe("vtt");
    expect(inferSupportedFileTranslationFileFormat("captions.sbv")).toBe("sbv");
    expect(inferSupportedFileTranslationFileFormat("mark.svg")).toBe("svg");
    expect(inferSupportedSourceUploadFormat("assets/mark.svg")).toBe("svg");
    expect(isBinaryTranslationFileFormat("svg")).toBe(false);
    expect(isWholeFileTranslationFileFormat("svg")).toBe(false);
    expect(inferSupportedTranslationFileFormat("hero.lottie")).toBe("lottie");
    expect(inferSupportedFileTranslationFileFormat("hero.lottie")).toBe("lottie");
    expect(inferSupportedSourceUploadFormat("animations/hero.lottie")).toBe("lottie");
    expect(isSupportedSourceUploadFormat("hero.lottie")).toBe(true);
    // Lottie is key-extractable (not a binary whole-file CAT unit).
    expect(isBinaryTranslationFileFormat("lottie")).toBe(false);
    expect(isWholeFileTranslationFileFormat("lottie")).toBe(false);
  });

  it("infers CLI-supported image formats separately", () => {
    expect(inferSupportedTranslationFileFormat("banner.png")).toBe("png");
    expect(inferSupportedTranslationFileFormat("banner.jpg")).toBe("jpeg");
    expect(inferSupportedTranslationFileFormat("banner.jpeg")).toBe("jpeg");
    expect(inferSupportedTranslationFileFormat("banner.webp")).toBe("webp");
    expect(inferSupportedFileTranslationFileFormat("banner.png")).toBe("png");
    expect(inferSupportedSourceUploadFormat("banner.png")).toBe("png");
    expect(inferSupportedImageTranslationFileFormat("banner.jpg")).toBe("jpeg");
    expect(isSupportedSourceUploadFormat("banner.webp")).toBe(true);
    expect(isImageTranslationFileFormat("png")).toBe(true);
    expect(isImageTranslationFileFormat("json")).toBe(false);
  });

  it("infers CLI-supported video formats separately", () => {
    expect(inferSupportedTranslationFileFormat("clip.mp4")).toBe("mp4");
    expect(inferSupportedFileTranslationFileFormat("clip.mp4")).toBe("mp4");
    expect(inferSupportedSourceUploadFormat("clip.mp4")).toBe("mp4");
    expect(isSupportedSourceUploadFormat("hero.mp4")).toBe(true);
    expect(isVideoTranslationFileFormat("mp4")).toBe(true);
    expect(isVideoTranslationFileFormat("png")).toBe(false);
    expect(isBinaryTranslationFileFormat("mp4")).toBe(true);
  });

  it("detects image-looking http urls", () => {
    expect(looksLikeImageUrl("https://cdn.example.com/hero.png")).toBe(true);
    expect(looksLikeImageUrl("https://cdn.example.com/hero.jpg?w=800")).toBe(true);
    expect(looksLikeImageUrl("https://cdn.example.com/doc.pdf")).toBe(false);
    expect(looksLikeImageUrl("not-a-url")).toBe(false);
  });

  it("detects direct mp4 http urls", () => {
    expect(looksLikeVideoUrl("https://cdn.example.com/clip.mp4")).toBe(true);
    expect(looksLikeVideoUrl("https://cdn.example.com/clip.mp4?token=1")).toBe(true);
    expect(looksLikeVideoUrl("https://youtube.com/watch?v=abc")).toBe(false);
    expect(looksLikeVideoUrl("https://cdn.example.com/hero.png")).toBe(false);
    expect(looksLikeVideoUrl("not-a-url")).toBe(false);
  });

  it("infers office formats as binary translation sources", () => {
    expect(inferSupportedTranslationFileFormat("brief.docx")).toBe("docx");
    expect(inferSupportedTranslationFileFormat("spreadsheet.xlsx")).toBe("xlsx");
    expect(inferSupportedTranslationFileFormat("legacy.xls")).toBe("xls");
    expect(inferSupportedTranslationFileFormat("deck.pptx")).toBe("pptx");
    expect(inferSupportedOfficeTranslationFileFormat("deck.pptx")).toBe("pptx");
    expect(inferSupportedSourceUploadFormat("brief.docx")).toBe("docx");
    expect(isSupportedSourceUploadFormat("deck.pptx")).toBe(true);
    expect(inferSupportedFileTranslationFileFormat("brief.docx")).toBeNull();
    expect(isOfficeTranslationFileFormat("docx")).toBe(true);
    expect(isBinaryTranslationFileFormat("xlsx")).toBe(true);
    expect(isBinaryTranslationFileFormat("png")).toBe(true);
    expect(isBinaryTranslationFileFormat("json")).toBe(false);
  });

  it("treats html, markdown, mdx, and asciidoc as whole-file documents, not binary", () => {
    expect(inferSupportedDocumentTranslationFileFormat("page.html")).toBe("html");
    expect(inferSupportedDocumentTranslationFileFormat("page.htm")).toBe("html");
    expect(inferSupportedDocumentTranslationFileFormat("readme.md")).toBe("markdown");
    expect(inferSupportedDocumentTranslationFileFormat("page.mdx")).toBe("mdx");
    expect(inferSupportedDocumentTranslationFileFormat("guide.adoc")).toBe("asciidoc");
    expect(isDocumentTranslationFileFormat("html")).toBe(true);
    expect(isDocumentTranslationFileFormat("markdown")).toBe(true);
    expect(isDocumentTranslationFileFormat("mdx")).toBe(true);
    expect(isDocumentTranslationFileFormat("asciidoc")).toBe(true);
    expect(isDocumentTranslationFileFormat("json")).toBe(false);
    expect(isWholeFileTranslationFileFormat("html")).toBe(true);
    expect(isWholeFileTranslationFileFormat("markdown")).toBe(true);
    expect(isWholeFileTranslationFileFormat("mdx")).toBe(true);
    expect(isWholeFileTranslationFileFormat("asciidoc")).toBe(true);
    expect(isWholeFileTranslationFileFormat("json")).toBe(false);
    expect(isBinaryTranslationFileFormat("html")).toBe(false);
    expect(isBinaryTranslationFileFormat("markdown")).toBe(false);
    expect(isBinaryTranslationFileFormat("mdx")).toBe(false);
    expect(isBinaryTranslationFileFormat("asciidoc")).toBe(false);
  });

  it("builds a source-upload accept list including office and images", () => {
    const accept = getSupportedSourceUploadAccept();
    expect(accept.split(",")).toEqual(
      expect.arrayContaining([
        ".json",
        ".srt",
        ".vtt",
        ".sbv",
        ".svg",
        ".tsv",
        ".toml",
        ".lottie",
        ".png",
        ".mp4",
        ".docx",
        ".xlsx",
        ".xls",
        ".pptx",
        ".webp",
        ".xml",
        ".properties",
        ".php",
        ".ftl",
        ".resx",
        ".resw",
        ".liquid",
        ".ts",
        ".js",
        ".htm",
        ".markdown",
      ]),
    );
  });

  it("builds a catalog import accept list without office or images", () => {
    const accept = getSupportedFileTranslationAccept();
    expect(accept.split(",")).toEqual(
      expect.arrayContaining([
        ".xml",
        ".properties",
        ".php",
        ".ftl",
        ".resx",
        ".liquid",
        ".ts",
        ".tsv",
        ".toml",
        ".sbv",
        ".svg",
      ]),
    );
    expect(accept.split(",")).not.toEqual(expect.arrayContaining([".png", ".mp4", ".docx"]));
  });

  it("rejects unsupported file extensions", () => {
    expect(inferSupportedTranslationFileFormat("brief.pdf")).toBeNull();
    expect(inferSupportedTranslationFileFormat("no-extension")).toBeNull();
  });

  it("returns locale scan extensions for supported file formats", () => {
    expect(getLocaleScanExtensions()).toEqual(
      expect.arrayContaining([
        "json",
        "jsonc",
        "yaml",
        "yml",
        "po",
        "ts",
        "xlf",
        "xliff",
        "arb",
        "xcstrings",
        "strings",
        "ini",
        "xml",
        "properties",
        "php",
        "ftl",
        "resx",
        "js",
        "ts",
        "liquid",
        "srt",
        "vtt",
        "sbv",
        "svg",
        "tsv",
        "toml",
      ]),
    );
    expect(getLocaleScanExtensions()).not.toContain("png");
  });
});
