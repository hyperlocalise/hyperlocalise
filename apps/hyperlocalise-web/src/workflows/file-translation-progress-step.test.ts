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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  extractHtmlIngestEntries,
  legacyHtmlSegmentKey,
} from "@/lib/projects/files/html-ingest-entries";

const { readTranslatedFileMock, extractSandboxEntriesMock } = vi.hoisted(() => ({
  readTranslatedFileMock: vi.fn(),
  extractSandboxEntriesMock: vi.fn(),
}));

vi.mock("@/lib/translation/sandbox", () => ({
  readTranslatedFile: readTranslatedFileMock,
  extractSandboxEntries: extractSandboxEntriesMock,
}));

import { collectFileTranslationPageStep } from "./file-translation-progress";

const sourceHtml = "<p>Hello <strong>world</strong>!</p>";
const targetHtml = "<p>Bonjour <strong>monde</strong>!</p>";

function lockFor(outputFilename: string, completedKeys: string[]) {
  return {
    run_completed: {
      [outputFilename]: Object.fromEntries(
        completedKeys.map((key) => [key, { s: "Hello", t: "Bonjour" }]),
      ),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  extractSandboxEntriesMock.mockResolvedValue({ ok: false });
});

describe("collectFileTranslationPageStep HTML lock wiring", () => {
  it("rewrites hashed lock keys through the source HTML before collecting path entries", async () => {
    const folded = extractHtmlIngestEntries(sourceHtml, { foldInline: true });
    const hash = legacyHtmlSegmentKey(folded["html.p"] ?? "", new Map());
    const sourceEntries = extractHtmlIngestEntries(sourceHtml);

    readTranslatedFileMock.mockImplementation(async (_sandboxId: string, path: string) => {
      if (path === ".hyperlocalise.lock.json") {
        return JSON.stringify(lockFor("page.fr.html", [hash]));
      }
      if (path === "page.html") {
        return sourceHtml;
      }
      if (path === "page.fr.html") {
        return targetHtml;
      }
      throw new Error(`unexpected sandbox read: ${path}`);
    });

    await expect(
      collectFileTranslationPageStep({
        sandboxId: "sbx_html",
        inputFilename: "page.html",
        outputFilenames: { "fr-FR": "page.fr.html" },
        sourceEntries,
        prefills: {},
        confirmed: {},
      }),
    ).resolves.toEqual({
      "fr-FR": {
        "html.p": "Bonjour ",
        "html.p.strong": "monde",
      },
    });

    expect(extractSandboxEntriesMock).not.toHaveBeenCalled();
    expect(readTranslatedFileMock).toHaveBeenCalledWith("sbx_html", ".hyperlocalise.lock.json");
    expect(readTranslatedFileMock).toHaveBeenCalledWith("sbx_html", "page.html");
    expect(readTranslatedFileMock).toHaveBeenCalledWith("sbx_html", "page.fr.html");
  });

  it("reconciles Figma JSON from the target file when hl entries lag source fallbacks", async () => {
    const key = "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const sourceEntries = { [key]: "Hello" };
    const outputFilename = "page-home-12-34-vi-VN.json";

    readTranslatedFileMock.mockImplementation(async (_sandboxId: string, path: string) => {
      if (path === ".hyperlocalise.lock.json") {
        return JSON.stringify(lockFor(outputFilename, [key]));
      }
      if (path === outputFilename) {
        return JSON.stringify({ [key]: "Xin chào" });
      }
      throw new Error(`unexpected sandbox read: ${path}`);
    });
    extractSandboxEntriesMock.mockResolvedValue({
      ok: true,
      entries: { [key]: "Hello" },
    });

    await expect(
      collectFileTranslationPageStep({
        sandboxId: "sbx_figma",
        inputFilename: "page-home-12-34.json",
        outputFilenames: { "vi-VN": outputFilename },
        sourceEntries,
        prefills: {},
        confirmed: {},
        hlRunFingerprint: "0:1:6:0:0",
      }),
    ).resolves.toEqual({
      "vi-VN": { [key]: "Xin chào" },
    });
  });

  it("reconciles Figma JSON from hash-only target file when hl entries lag", async () => {
    const { createHash } = await import("node:crypto");
    const source = "Welcome back";
    const hash = createHash("sha256").update(source, "utf8").digest("hex").slice(0, 16);
    const key = "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const sourceEntries = { [key]: source };
    const outputFilename = "page-home-12-34-vi-VN.json";

    readTranslatedFileMock.mockImplementation(async (_sandboxId: string, path: string) => {
      if (path === ".hyperlocalise.lock.json") {
        return JSON.stringify({
          run_completed: {
            [outputFilename]: {
              [`json.${hash}`]: { s: "deadbeef", t: "cafebabe" },
            },
          },
        });
      }
      if (path === outputFilename) {
        return JSON.stringify({ [`json.${hash}`]: "Chào mừng trở lại" });
      }
      throw new Error(`unexpected sandbox read: ${path}`);
    });
    extractSandboxEntriesMock.mockResolvedValue({
      ok: true,
      entries: { [`json.${hash}`]: source },
    });

    await expect(
      collectFileTranslationPageStep({
        sandboxId: "sbx_figma_hash_only",
        inputFilename: "page-home-12-34.json",
        outputFilenames: { "vi-VN": outputFilename },
        sourceEntries,
        prefills: {},
        confirmed: {},
        hlRunFingerprint: "0:1:1:0:0",
      }),
    ).resolves.toEqual({
      "vi-VN": { [key]: "Chào mừng trở lại" },
    });
  });

  it("maps a hashed lock key onto Figma stamp keys from the target file", async () => {
    const { createHash } = await import("node:crypto");
    const source = "Project title";
    const hash = createHash("sha256").update(source, "utf8").digest("hex").slice(0, 16);
    const first = "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const sibling = "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAW";
    const sourceEntries = { [first]: source, [sibling]: source };
    const outputFilename = "12-34-ja-JP.json";

    readTranslatedFileMock.mockImplementation(async (_sandboxId: string, path: string) => {
      if (path === ".hyperlocalise.lock.json") {
        return JSON.stringify({
          run_completed: {
            [`./${outputFilename}`]: {
              [`json.${hash}`]: { s: "deadbeef", t: "cafebabe" },
            },
          },
        });
      }
      if (path === outputFilename) {
        return JSON.stringify({ [first]: "プロジェクトタイトル", [sibling]: source });
      }
      throw new Error(`unexpected sandbox read: ${path}`);
    });
    extractSandboxEntriesMock.mockResolvedValue({
      ok: true,
      entries: { [`json.${hash}`]: source },
    });

    await expect(
      collectFileTranslationPageStep({
        sandboxId: "sbx_figma_hash",
        inputFilename: "12-34.json",
        outputFilenames: { "ja-JP": outputFilename },
        sourceEntries,
        prefills: {},
        confirmed: {},
        hlRunFingerprint: "0:1:1:0:0",
      }),
    ).resolves.toEqual({
      "ja-JP": {
        [first]: "プロジェクトタイトル",
        [sibling]: "プロジェクトタイトル",
      },
    });
  });

  it("copies a Figma translation onto stamp keys that share source text", async () => {
    const translated = "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const sibling = "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAW";
    const sourceEntries = {
      [translated]: "Project title",
      [sibling]: "Project title",
    };
    const outputFilename = "12-34-ja-JP.json";

    readTranslatedFileMock.mockImplementation(async (_sandboxId: string, path: string) => {
      if (path === ".hyperlocalise.lock.json") {
        return JSON.stringify(lockFor(outputFilename, [translated]));
      }
      if (path === outputFilename) {
        return JSON.stringify({ [translated]: "プロジェクトタイトル", [sibling]: "Project title" });
      }
      throw new Error(`unexpected sandbox read: ${path}`);
    });
    extractSandboxEntriesMock.mockResolvedValue({
      ok: true,
      entries: { [translated]: "Project title" },
    });

    await expect(
      collectFileTranslationPageStep({
        sandboxId: "sbx_figma",
        inputFilename: "12-34.json",
        outputFilenames: { "ja-JP": outputFilename },
        sourceEntries,
        prefills: {},
        confirmed: {},
        hlRunFingerprint: "0:1:1:0:0",
      }),
    ).resolves.toEqual({
      "ja-JP": {
        [translated]: "プロジェクトタイトル",
        [sibling]: "プロジェクトタイトル",
      },
    });
  });

  it("reconciles Canva JSON from the target file when hl entries lag source fallbacks", async () => {
    const key = "canva.t.2b52fdaa63b8822c";
    const sourceEntries = { [key]: "Describe a Cat" };
    const outputFilename = "page-1-vi-VN.json";

    readTranslatedFileMock.mockImplementation(async (_sandboxId: string, path: string) => {
      if (path === ".hyperlocalise.lock.json") {
        return JSON.stringify(lockFor(outputFilename, [key]));
      }
      if (path === outputFilename) {
        return JSON.stringify({ [key]: "Mô tả một con mèo" });
      }
      throw new Error(`unexpected sandbox read: ${path}`);
    });
    extractSandboxEntriesMock.mockResolvedValue({
      ok: true,
      entries: { [key]: "Describe a Cat" },
    });

    await expect(
      collectFileTranslationPageStep({
        sandboxId: "sbx_canva",
        inputFilename: "page-1.json",
        outputFilenames: { "vi-VN": outputFilename },
        sourceEntries,
        prefills: {},
        confirmed: {},
        hlRunFingerprint: "0:1:6:0:0",
      }),
    ).resolves.toEqual({
      "vi-VN": { [key]: "Mô tả một con mèo" },
    });
  });

  it("omits confirmed HTML path keys and locales that have nothing new", async () => {
    const folded = extractHtmlIngestEntries(sourceHtml, { foldInline: true });
    const hash = legacyHtmlSegmentKey(folded["html.p"] ?? "", new Map());
    const sourceEntries = extractHtmlIngestEntries(sourceHtml);

    readTranslatedFileMock.mockImplementation(async (_sandboxId: string, path: string) => {
      if (path === ".hyperlocalise.lock.json") {
        return JSON.stringify(lockFor("page.fr.html", [hash]));
      }
      if (path === "page.html") {
        return sourceHtml;
      }
      return targetHtml;
    });

    await expect(
      collectFileTranslationPageStep({
        sandboxId: "sbx_html",
        inputFilename: "page.html",
        outputFilenames: { "fr-FR": "page.fr.html" },
        sourceEntries,
        prefills: {},
        confirmed: {
          "fr-FR": {
            "html.p": "Bonjour ",
            "html.p.strong": "monde",
          },
        },
      }),
    ).resolves.toEqual({});
  });
});
