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
