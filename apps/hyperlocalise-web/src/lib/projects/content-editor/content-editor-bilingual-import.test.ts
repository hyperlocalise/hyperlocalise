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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  catBilingualImportApiPath,
  groupCatBilingualImportEntries,
  postCatBilingualImport,
} from "./content-editor-bilingual-import";
import type { ContentEditorFilteredExportRow } from "./content-editor-filtered-export";

function row(
  overrides: Partial<ContentEditorFilteredExportRow> & Pick<ContentEditorFilteredExportRow, "key">,
): ContentEditorFilteredExportRow {
  return {
    sourceText: "Hello",
    targetText: "Bonjour",
    sourceLocale: "en",
    targetLocale: "fr",
    sourcePath: "a.json",
    ...overrides,
  };
}

describe("groupCatBilingualImportEntries", () => {
  it("groups rows by source path and skips empty targets", () => {
    const grouped = groupCatBilingualImportEntries({
      sourcePath: "*",
      targetLocale: "fr",
      rows: [
        row({ key: "keep", sourcePath: "a.json" }),
        row({ key: "empty", targetText: "  ", sourcePath: "a.json" }),
        row({ key: "other", sourcePath: "b.json", targetText: "Autre" }),
      ],
    });

    expect(grouped.skipped).toBe(1);
    expect(grouped.entriesByPath.get("a.json")).toEqual({ keep: "Bonjour" });
    expect(grouped.entriesByPath.get("b.json")).toEqual({ other: "Autre" });
  });

  it("scopes a single-file import and fills missing source paths", () => {
    const grouped = groupCatBilingualImportEntries({
      sourcePath: "a.json",
      targetLocale: "fr",
      rows: [
        row({ key: "from-file", sourcePath: "" }),
        row({ key: "other-file", sourcePath: "b.json" }),
        row({ key: "locale-miss", targetLocale: "de" }),
      ],
    });

    expect(grouped.entriesByPath.get("a.json")).toEqual({ "from-file": "Bonjour" });
    expect(grouped.skipped).toBe(2);
  });
});

describe("postCatBilingualImport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the bilingual file and returns import counts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ import: { matched: 2, imported: 1, skipped: 1, files: 1 } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["<xliff/>"], "queue-fr.xliff", { type: "application/xliff+xml" });

    await expect(
      postCatBilingualImport({
        organizationSlug: "acme",
        projectId: "project_1",
        sourcePath: "locales/en.json",
        locale: "fr",
        file,
        fallbackMessage: "import failed",
      }),
    ).resolves.toEqual({ matched: 2, imported: 1, skipped: 1, files: 1 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(catBilingualImportApiPath("acme", "project_1"));
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("sourcePath")).toBe("locales/en.json");
    expect(form.get("locale")).toBe("fr");
    expect(form.get("file")).toBe(file);
  });

  it("throws the API error message when import fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "invalid_bilingual_file", message: "bad tags" }, { status: 400 }),
        ),
    );

    await expect(
      postCatBilingualImport({
        organizationSlug: "acme",
        projectId: "project_1",
        sourcePath: "*",
        locale: "fr",
        file: new File(["nope"], "queue-fr.csv", { type: "text/csv" }),
        fallbackMessage: "import failed",
      }),
    ).rejects.toMatchObject({ message: "bad tags" });
  });
});
