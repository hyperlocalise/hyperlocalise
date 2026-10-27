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
import { describe, expect, it, vi } from "vite-plus/test";

import {
  buildFigmaSourcePullEntries,
  figmaJobHasPullableTranslations,
  figmaJobMatchesPage,
  figmaSourceIngestIsSettled,
  isFigmaIntegrationJob,
  figmaLocalesMatch,
  isProjectSourceLocale,
  mergeFigmaPullTranslations,
  pickTranslationsForLocale,
  publicFigmaJobStatus,
  publicJobOutputFiles,
  waitForFigmaSourceIngest,
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

  it("keeps the job translation when the editor row is only the source fallback", () => {
    expect(
      mergeFigmaPullTranslations(
        { "figma.k.a": "Project title" },
        { "figma.k.a": "Tiêu đề dự án" },
        { "figma.k.a": "Project title" },
      ),
    ).toEqual({ "figma.k.a": "Tiêu đề dự án" });
  });

  it("ignores multi-word job text that copies the source", () => {
    expect(
      mergeFigmaPullTranslations(
        {},
        { "figma.k.a": "Print Marketing." },
        { "figma.k.a": "Print Marketing." },
      ),
    ).toEqual({});
  });
});

describe("pickTranslationsForLocale", () => {
  it("matches locale tags case-insensitively", () => {
    const map = { "vi-VN": { "figma.k.a": "Xin chào" } };
    expect(pickTranslationsForLocale(map, "vi-vn")).toEqual({ "figma.k.a": "Xin chào" });
  });

  it("does not match a language-only tag to a regional project locale", () => {
    const map = { "vi-VN": { "figma.k.a": "Xin chào" } };
    expect(pickTranslationsForLocale(map, "vi")).toBeUndefined();
  });

  it("returns only the requested locale when the job map has two targets", () => {
    const map = {
      "ja-JP": { "figma.k.a": "こんにちは" },
      "zh-CN": { "figma.k.a": "你好" },
    };
    expect(pickTranslationsForLocale(map, "zh-CN")).toEqual({ "figma.k.a": "你好" });
    expect(pickTranslationsForLocale(map, "ja-JP")).toEqual({ "figma.k.a": "こんにちは" });
  });
});

describe("isProjectSourceLocale", () => {
  it("matches source locale tags case-insensitively", () => {
    expect(isProjectSourceLocale("en-US", "en-us")).toBe(true);
    expect(isProjectSourceLocale("en-US", "fr-FR")).toBe(false);
    expect(isProjectSourceLocale("en", "en-US")).toBe(false);
  });
});

describe("figmaLocalesMatch", () => {
  it("matches exact project locale tags only", () => {
    expect(figmaLocalesMatch("vi-VN", "vi-vn")).toBe(true);
    expect(figmaLocalesMatch("vi-VN", "vi")).toBe(false);
    expect(figmaLocalesMatch("zh-CN", "zh-TW")).toBe(false);
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

describe("waitForFigmaSourceIngest", () => {
  it("treats ingested, skipped, and failed as settled", () => {
    expect(figmaSourceIngestIsSettled("ingested")).toBe(true);
    expect(figmaSourceIngestIsSettled("skipped")).toBe(true);
    expect(figmaSourceIngestIsSettled("failed")).toBe(true);
    expect(figmaSourceIngestIsSettled("pending")).toBe(false);
    expect(figmaSourceIngestIsSettled("ingesting")).toBe(false);
    expect(figmaSourceIngestIsSettled(null)).toBe(false);
  });

  it("returns immediately when the collected page has ingested", async () => {
    const loadStates = vi.fn(async () => ["ingested"]);
    await expect(
      waitForFigmaSourceIngest({
        organizationId: "org_1",
        projectId: "project_1",
        sourcePaths: ["figma/files/abc/12-34.json"],
        loadStates,
      }),
    ).resolves.toBe(true);
    expect(loadStates).toHaveBeenCalledTimes(1);
  });
});
