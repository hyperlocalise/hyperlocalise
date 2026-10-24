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

import {
  collectFileTranslationPageStep,
  sandboxCliLockfileCopyPath,
  sandboxCliLockfilePath,
} from "./file-translation-progress";

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
    expect(readTranslatedFileMock).toHaveBeenCalledWith("sbx_html", sandboxCliLockfilePath);
    expect(readTranslatedFileMock).toHaveBeenCalledWith("sbx_html", "page.html");
    expect(readTranslatedFileMock).toHaveBeenCalledWith("sbx_html", "page.fr.html");
  });

  it("collects Canva keys from hl entries only", async () => {
    const key = "canva.t.2b52fdaa63b8822c";
    const sourceEntries = { [key]: "Describe a Cat" };
    const outputFilename = "page-1-vi-VN.json";

    readTranslatedFileMock.mockImplementation(async (_sandboxId: string, path: string) => {
      if (path === ".hyperlocalise.lock.json") {
        return JSON.stringify(lockFor(outputFilename, [key]));
      }
      throw new Error(`unexpected sandbox read: ${path}`);
    });
    extractSandboxEntriesMock.mockResolvedValue({
      ok: true,
      entries: { [key]: "Mô tả một con mèo" },
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
    expect(readTranslatedFileMock).not.toHaveBeenCalledWith("sbx_canva", outputFilename);
  });

  it("reads workbook outputs from the target column", async () => {
    const outputFilename = "strings-fr-FR.xlsx";
    readTranslatedFileMock.mockResolvedValue(
      JSON.stringify(lockFor(outputFilename, ["home.title"])),
    );
    extractSandboxEntriesMock.mockResolvedValue({
      ok: true,
      entries: { "home.title": "Accueil" },
    });

    await expect(
      collectFileTranslationPageStep({
        sandboxId: "sbx_xlsx",
        inputFilename: "strings.xlsx",
        outputFilenames: { "fr-FR": outputFilename },
        sourceEntries: { "home.title": "Home" },
        sourceLocale: "en-US",
        prefills: {},
        confirmed: {},
      }),
    ).resolves.toEqual({ "fr-FR": { "home.title": "Accueil" } });
    expect(extractSandboxEntriesMock).toHaveBeenCalledWith("sbx_xlsx", outputFilename, {
      sourcePath: "strings.xlsx",
      sourceLocale: "en-US",
      locale: "fr-FR",
    });
  });

  it("maps CLI shared-workbook lock keys onto source keys", async () => {
    const outputFilename = "strings-fr-FR.xlsx";
    readTranslatedFileMock.mockResolvedValue(
      JSON.stringify(lockFor(outputFilename, ["home.title::fr-FR", "home.cta::fr-FR"])),
    );
    extractSandboxEntriesMock.mockResolvedValue({
      ok: true,
      entries: { "home.title": "Accueil", "home.cta": "Essai gratuit" },
    });

    await expect(
      collectFileTranslationPageStep({
        sandboxId: "sbx_xlsx",
        inputFilename: "strings.xlsx",
        outputFilenames: { "fr-FR": outputFilename },
        sourceEntries: { "home.title": "Home", "home.cta": "Start free trial" },
        sourceLocale: "en-US",
        prefills: {},
        confirmed: {},
      }),
    ).resolves.toEqual({
      "fr-FR": { "home.title": "Accueil", "home.cta": "Essai gratuit" },
    });
  });

  it("maps locale-suffixed CSV lock keys onto source keys", async () => {
    const outputFilename = "strings-fr-FR.csv";
    readTranslatedFileMock.mockResolvedValue(
      JSON.stringify(lockFor(outputFilename, ["home.title::fr-FR"])),
    );
    extractSandboxEntriesMock.mockResolvedValue({
      ok: true,
      entries: { "home.title": "Accueil" },
    });

    await expect(
      collectFileTranslationPageStep({
        sandboxId: "sbx_csv",
        inputFilename: "strings.csv",
        outputFilenames: { "fr-FR": outputFilename },
        sourceEntries: { "home.title": "Home" },
        sourceLocale: "en-US",
        prefills: {},
        confirmed: {},
      }),
    ).resolves.toEqual({ "fr-FR": { "home.title": "Accueil" } });
  });

  it("throws when extracting a completed spreadsheet output fails", async () => {
    const outputFilename = "strings-fr-FR.csv";
    readTranslatedFileMock.mockResolvedValue(
      JSON.stringify(lockFor(outputFilename, ["home.title::fr-FR"])),
    );
    extractSandboxEntriesMock.mockResolvedValue({ ok: false });

    await expect(
      collectFileTranslationPageStep({
        sandboxId: "sbx_csv",
        inputFilename: "strings.csv",
        outputFilenames: { "fr-FR": outputFilename },
        sourceEntries: { "home.title": "Home" },
        sourceLocale: "en-US",
        prefills: {},
        confirmed: {},
      }),
    ).rejects.toThrow("failed to extract completed translations");
  });

  it("collects path-key lock completions written by CLI 1.13.4", async () => {
    const sourceEntries = extractHtmlIngestEntries(sourceHtml);

    readTranslatedFileMock.mockImplementation(async (_sandboxId: string, path: string) => {
      if (path === ".hyperlocalise.lock.json") {
        return JSON.stringify(lockFor("page.fr.html", ["html.p", "html.p.strong"]));
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
        sandboxId: "sbx_html_paths",
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
  });

  it("skips path-key completions the renderer fell back to source for", async () => {
    const sourceEntries = extractHtmlIngestEntries(sourceHtml);

    readTranslatedFileMock.mockImplementation(async (_sandboxId: string, path: string) => {
      if (path === ".hyperlocalise.lock.json") {
        return JSON.stringify(lockFor("page.fr.html", ["html.p", "html.p.strong"]));
      }
      if (path === "page.html" || path === "page.fr.html") {
        return sourceHtml;
      }
      throw new Error(`unexpected sandbox read: ${path}`);
    });

    await expect(
      collectFileTranslationPageStep({
        sandboxId: "sbx_html_fallback",
        inputFilename: "page.html",
        outputFilenames: { "fr-FR": "page.fr.html" },
        sourceEntries,
        prefills: {},
        confirmed: {},
      }),
    ).resolves.toEqual({});
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

  it("treats a missing lockfile as empty instead of failing the step", async () => {
    readTranslatedFileMock.mockImplementation(async (_sandboxId: string, path: string) => {
      throw new Error(`failed to read translated file: ${path}`);
    });

    await expect(
      collectFileTranslationPageStep({
        sandboxId: "sbx_missing_lock",
        inputFilename: "strings.json",
        outputFilenames: { "fr-FR": "strings.fr-FR.json" },
        sourceEntries: { greeting: "Hello" },
        prefills: {},
        confirmed: {},
      }),
    ).resolves.toEqual({});
    expect(readTranslatedFileMock).toHaveBeenCalledWith("sbx_missing_lock", sandboxCliLockfilePath);
    expect(readTranslatedFileMock).toHaveBeenCalledWith(
      "sbx_missing_lock",
      sandboxCliLockfileCopyPath,
    );
    expect(extractSandboxEntriesMock).not.toHaveBeenCalled();
  });

  it("maps HTML path-key prefills when CLI 1.13.5 left an empty lock", async () => {
    const sourceEntries = extractHtmlIngestEntries(sourceHtml);

    readTranslatedFileMock.mockImplementation(async (_sandboxId: string, path: string) => {
      if (path === sandboxCliLockfilePath) {
        throw new Error(`failed to read translated file: ${path}`);
      }
      if (path === sandboxCliLockfileCopyPath) {
        return "{}\n";
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
        sandboxId: "sbx_html_prefill",
        inputFilename: "page.html",
        outputFilenames: { "fr-FR": "page.fr.html" },
        sourceEntries,
        prefills: {
          "fr-FR": {
            "html.p": "Bonjour ",
            "html.p.strong": "monde",
          },
        },
        confirmed: {},
      }),
    ).resolves.toEqual({
      "fr-FR": {
        "html.p": "Bonjour ",
        "html.p.strong": "monde",
      },
    });
  });

  it("maps hashed HTML prefills onto source path keys when the lockfile is missing", async () => {
    const folded = extractHtmlIngestEntries(sourceHtml, { foldInline: true });
    const hash = legacyHtmlSegmentKey(folded["html.p"] ?? "", new Map());
    const sourceEntries = extractHtmlIngestEntries(sourceHtml);

    readTranslatedFileMock.mockImplementation(async (_sandboxId: string, path: string) => {
      if (path === sandboxCliLockfilePath || path === sandboxCliLockfileCopyPath) {
        throw new Error(`failed to read translated file: ${path}`);
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
        sandboxId: "sbx_html_hashed_prefill",
        inputFilename: "page.html",
        outputFilenames: { "fr-FR": "page.fr.html" },
        sourceEntries,
        prefills: { "fr-FR": { [hash]: "Bonjour <strong>monde</strong>!" } },
        confirmed: {},
      }),
    ).resolves.toEqual({
      "fr-FR": {
        "html.p": "Bonjour ",
        "html.p.strong": "monde",
      },
    });
  });

  it("collects prefill keys when the lockfile is missing", async () => {
    const outputFilename = "strings-fr-FR.json";
    readTranslatedFileMock.mockImplementation(async (_sandboxId: string, path: string) => {
      throw new Error(`failed to read translated file: ${path}`);
    });
    extractSandboxEntriesMock.mockResolvedValue({
      ok: true,
      entries: { greeting: "Bonjour" },
    });

    await expect(
      collectFileTranslationPageStep({
        sandboxId: "sbx_prefill_lock",
        inputFilename: "strings.json",
        outputFilenames: { "fr-FR": outputFilename },
        sourceEntries: { greeting: "Hello" },
        prefills: { "fr-FR": { greeting: "Bonjour" } },
        confirmed: {},
      }),
    ).resolves.toEqual({ "fr-FR": { greeting: "Bonjour" } });
  });

  it("reads the materialized lock copy when the hidden lockfile is unreadable", async () => {
    const outputFilename = "strings-fr-FR.json";
    readTranslatedFileMock.mockImplementation(async (_sandboxId: string, path: string) => {
      if (path === sandboxCliLockfilePath) {
        throw new Error(`failed to read translated file: ${path}`);
      }
      if (path === sandboxCliLockfileCopyPath) {
        return JSON.stringify(lockFor(outputFilename, ["greeting"]));
      }
      throw new Error(`unexpected sandbox read: ${path}`);
    });
    extractSandboxEntriesMock.mockResolvedValue({
      ok: true,
      entries: { greeting: "Bonjour" },
    });

    await expect(
      collectFileTranslationPageStep({
        sandboxId: "sbx_lock_copy",
        inputFilename: "strings.json",
        outputFilenames: { "fr-FR": outputFilename },
        sourceEntries: { greeting: "Hello" },
        prefills: {},
        confirmed: {},
      }),
    ).resolves.toEqual({ "fr-FR": { greeting: "Bonjour" } });
  });
});
