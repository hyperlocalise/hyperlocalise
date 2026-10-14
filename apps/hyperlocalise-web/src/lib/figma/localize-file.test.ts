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
  buildFigmaSourcePullEntries,
  figmaJobHasPullableTranslations,
  figmaJobMatchesPage,
  isFigmaIntegrationJob,
  isProjectSourceLocale,
  mergeFigmaPullTranslations,
  pickTranslationsForLocale,
  publicFigmaJobStatus,
  publicJobOutputFiles,
} from "./localize-file";

describe("mergeFigmaPullTranslations", () => {
  it("fills missing editor rows from job output and prefers editor text", () => {
    expect(
      mergeFigmaPullTranslations(
        { "figma.k.a": "Hola (editor)" },
        { "figma.k.a": "Hola (job)", "figma.k.b": "Mundo" },
      ),
    ).toEqual({
      "figma.k.a": "Hola (editor)",
      "figma.k.b": "Mundo",
    });
    expect(mergeFigmaPullTranslations({}, { "figma.k.a": "Hola" })).toEqual({
      "figma.k.a": "Hola",
    });
  });
});

describe("pickTranslationsForLocale", () => {
  it("matches locale tags case-insensitively", () => {
    const map = { "vi-VN": { "figma.k.a": "Xin chào" } };
    expect(pickTranslationsForLocale(map, "vi-vn")).toEqual({ "figma.k.a": "Xin chào" });
  });

  it("matches by language subtag when the region tag differs", () => {
    const map = { "vi-VN": { "figma.k.a": "Xin chào" } };
    expect(pickTranslationsForLocale(map, "vi")).toEqual({ "figma.k.a": "Xin chào" });
  });
});

describe("isProjectSourceLocale", () => {
  it("matches source locale tags case-insensitively", () => {
    expect(isProjectSourceLocale("en-US", "en-us")).toBe(true);
    expect(isProjectSourceLocale("en-US", "fr-FR")).toBe(false);
  });
});

describe("buildFigmaSourcePullEntries", () => {
  it("builds entries from stamp keys and drops duplicate known text", () => {
    expect(
      buildFigmaSourcePullEntries({
        sourceFile: {
          "figma.k.a": "Hello",
          "figma.segment.legacy": "Legacy",
          other: "Skip",
        },
        knownTextsByKey: new Map([["figma.k.a", ["Hello", "Hola"]]]),
      }),
    ).toEqual([
      {
        key: "figma.k.a",
        source: "Hello",
        knownTexts: ["Hola"],
      },
    ]);
  });
});

describe("publicJobOutputFiles", () => {
  it("returns null for non file_result outcomes", () => {
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "error",
        outcomePayload: { outputFiles: [] },
      }),
    ).toBeNull();
    expect(
      publicJobOutputFiles({
        type: "batch",
        outcomeKind: "file_result",
        outcomePayload: { outputFiles: [] },
      }),
    ).toBeNull();
  });

  it("returns null when outputFiles is missing or malformed", () => {
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "file_result",
        outcomePayload: null,
      }),
    ).toBeNull();
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "file_result",
        outcomePayload: { outputFiles: "nope" },
      }),
    ).toBeNull();
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "file_result",
        outcomePayload: {
          outputFiles: [{ fileId: "f1", locale: "es", filename: "" }],
        },
      }),
    ).toBeNull();
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "file_result",
        outcomePayload: {
          outputFiles: [{ fileId: "f1", locale: "es" }],
        },
      }),
    ).toBeNull();
  });

  it("parses valid output file entries", () => {
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "file_result",
        outcomePayload: {
          outputFiles: [
            { fileId: "file_1", locale: "es", filename: "page.es.json" },
            { fileId: "file_2", locale: "fr", filename: "page.fr.json" },
          ],
        },
      }),
    ).toEqual([
      { fileId: "file_1", locale: "es", filename: "page.es.json" },
      { fileId: "file_2", locale: "fr", filename: "page.fr.json" },
    ]);
  });
});

describe("isFigmaIntegrationJob", () => {
  it("detects figma-plugin metadata on nested or top-level payloads", () => {
    expect(
      isFigmaIntegrationJob({
        fileInput: { metadata: { integration: "figma-plugin" } },
      }),
    ).toBe(true);
    expect(
      isFigmaIntegrationJob({
        metadata: { integration: "figma-plugin" },
      }),
    ).toBe(true);
  });

  it("matches jobs to a Figma file and page", () => {
    const payload = {
      metadata: {
        integration: "figma-plugin",
        figmaFileKey: "abc123",
        figmaPageId: "12:34",
      },
    };
    expect(figmaJobMatchesPage(payload, { fileKey: "abc123", pageId: "12:34" })).toBe(true);
    expect(figmaJobMatchesPage(payload, { fileKey: "abc123", pageId: "99:00" })).toBe(false);
    expect(
      figmaJobMatchesPage(
        { metadata: { integration: "canva" } },
        { fileKey: "abc123", pageId: "12:34" },
      ),
    ).toBe(false);
  });

  it("maps unknown statuses to queued and treats review as pullable", () => {
    expect(publicFigmaJobStatus("running")).toBe("running");
    expect(publicFigmaJobStatus("waiting_for_review")).toBe("waiting_for_review");
    expect(publicFigmaJobStatus("mystery")).toBe("queued");
    expect(figmaJobHasPullableTranslations("waiting_for_review")).toBe(true);
    expect(figmaJobHasPullableTranslations("queued")).toBe(false);
  });

  it("rejects non-figma jobs and empty metadata", () => {
    expect(isFigmaIntegrationJob(null)).toBe(false);
    expect(isFigmaIntegrationJob({})).toBe(false);
    expect(
      isFigmaIntegrationJob({
        metadata: { integration: "canva" },
      }),
    ).toBe(false);
    expect(
      isFigmaIntegrationJob({
        fileInput: { metadata: { integration: "" } },
      }),
    ).toBe(false);
  });
});
