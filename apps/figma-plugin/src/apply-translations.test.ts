import { describe, expect, it } from "vite-plus/test";

import {
  buildApplySourceByKey,
  buildFigmaApplyTextIndex,
  isMultiWordSameAsSource,
  normalizeSegmentText,
  resolveFigmaApplyTarget,
} from "./apply-translations";
import { remapExtractedSegmentsToSource } from "./extract-source";

describe("buildFigmaApplyTextIndex", () => {
  it("matches by normalized source text when stamps are missing on apply", () => {
    const key = "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const index = buildFigmaApplyTextIndex({
      sourceByKey: { [key]: "Hello" },
      translations: { [key]: "Xin chào" },
    });
    expect(normalizeSegmentText("Hello")).toBe("Hello");
    expect(index.get("Hello")).toEqual({ key, target: "Xin chào" });
    expect(
      resolveFigmaApplyTarget({
        nodeText: "Hello",
        stampedKey: null,
        translations: { [key]: "Xin chào" },
        textIndex: index,
      }),
    ).toBe("Xin chào");
  });

  it("applies by stamp and source when canvas still shows a previous locale", () => {
    const key = "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const index = buildFigmaApplyTextIndex({
      sourceByKey: { [key]: "Hello" },
      translations: { [key]: "Xin chào" },
    });
    expect(
      resolveFigmaApplyTarget({
        nodeText: "こんにちは",
        stampedKey: key,
        translations: { [key]: "Xin chào" },
        textIndex: index,
        sourceByKey: { [key]: "Hello" },
      }),
    ).toBe("Xin chào");
  });

  it("does not match canvas text against another locale's translation string", () => {
    const keyA = "figma.k.a";
    const keyB = "figma.k.b";
    const index = buildFigmaApplyTextIndex({
      sourceByKey: { [keyA]: "Hello", [keyB]: "Bye" },
      translations: { [keyA]: "Xin chào", [keyB]: "Tạm biệt" },
    });
    expect(index.has("Xin chào")).toBe(false);
    expect(
      resolveFigmaApplyTarget({
        nodeText: "Xin chào",
        stampedKey: null,
        translations: { [keyA]: "Xin chào", [keyB]: "Tạm biệt" },
        textIndex: index,
      }),
    ).toBeNull();
  });

  it("builds sourceByKey from remapped stored English, not live Japanese canvas", () => {
    const key = "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const remapped = remapExtractedSegmentsToSource(
      [
        {
          key,
          nodeId: "1:2",
          regionIndex: 0,
          text: "こんにちは",
        },
      ],
      {
        locale: "en",
        sourcePath: "figma/files/abc/home-1-2.json",
        needsReupload: false,
        entries: [{ key, source: "Hello", knownTexts: ["こんにちは"] }],
      },
    );
    expect(buildApplySourceByKey(remapped)).toEqual({ [key]: "Hello" });
  });

  it("resets a stamped node to stored source when the new locale has no translation", () => {
    const key = "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const sourceByKey = { [key]: "Hello" };
    const index = buildFigmaApplyTextIndex({
      sourceByKey,
      translations: {},
    });
    expect(
      resolveFigmaApplyTarget({
        nodeText: "こんにちは",
        stampedKey: key,
        translations: {},
        textIndex: index,
        sourceByKey,
      }),
    ).toBe("Hello");
  });

  it("applies zh-CN or source on a Japanese canvas, never leftover Japanese", () => {
    const translated = "figma.k.a";
    const missing = "figma.k.b";
    const leftoverEnglish = "figma.k.c";
    const sourceByKey = {
      [translated]: "Hello",
      [missing]: "World",
      [leftoverEnglish]: "Social Media Campaigns.",
    };
    const translations = {
      [translated]: "你好",
      [leftoverEnglish]: "Social Media Campaigns.",
    };
    const index = buildFigmaApplyTextIndex({ sourceByKey, translations });
    expect(
      resolveFigmaApplyTarget({
        nodeText: "こんにちは",
        stampedKey: translated,
        translations,
        textIndex: index,
        sourceByKey,
      }),
    ).toBe("你好");
    expect(
      resolveFigmaApplyTarget({
        nodeText: "世界",
        stampedKey: missing,
        translations,
        textIndex: index,
        sourceByKey,
      }),
    ).toBe("World");
    expect(
      resolveFigmaApplyTarget({
        nodeText: "ソーシャルメディアキャンペーン。",
        stampedKey: leftoverEnglish,
        translations,
        textIndex: index,
        sourceByKey,
      }),
    ).toBe("Social Media Campaigns.");
  });
});

describe("isMultiWordSameAsSource", () => {
  it("treats multi-word copies as source fallback, not translations", () => {
    expect(isMultiWordSameAsSource("Print Marketing.", "Print Marketing.")).toBe(true);
    expect(isMultiWordSameAsSource("Nike", "Nike")).toBe(false);
    expect(isMultiWordSameAsSource("Print Marketing.", "In ấn tiếp thị.")).toBe(false);
  });

  it("resets a stamped node to stored source when the job only copied multi-word English", () => {
    const key = "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const sourceByKey = { [key]: "Print Marketing." };
    const translations = { [key]: "Print Marketing." };
    const index = buildFigmaApplyTextIndex({ sourceByKey, translations });
    expect(
      resolveFigmaApplyTarget({
        nodeText: "印刷マーケティング。",
        stampedKey: key,
        translations,
        textIndex: index,
        sourceByKey,
      }),
    ).toBe("Print Marketing.");
  });

  it("still applies a single-word brand that matches source", () => {
    const key = "figma.k.brand";
    const sourceByKey = { [key]: "Nike" };
    const translations = { [key]: "Nike" };
    const index = buildFigmaApplyTextIndex({ sourceByKey, translations });
    expect(
      resolveFigmaApplyTarget({
        nodeText: "ナイキ",
        stampedKey: key,
        translations,
        textIndex: index,
        sourceByKey,
      }),
    ).toBe("Nike");
  });
});
