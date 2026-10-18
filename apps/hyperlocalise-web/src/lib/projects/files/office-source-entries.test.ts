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
import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db } from "@/lib/database/client";
import { createStoredFile } from "@/lib/file-storage/records";
import { isErr, isOk } from "@/lib/primitives/result/results";
import { multilingualXlsxFixture } from "@/lib/translation/xlsx/xlsx-workbook.fixture";
import { XLSX_CONTENT_TYPE } from "@/lib/translation/xlsx/xlsx-workbook";

import {
  loadProjectOfficeSourceEntries,
  loadProjectOfficeTargetEntries,
} from "./office-source-entries";

const fixture = createProjectTestFixture();

describe("office source entries", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("maps workbook comments and length limits onto source entries", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const storedFile = await createStoredFile({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      role: "source",
      sourceKind: "repository_file",
      filename: "strings.xlsx",
      contentType: XLSX_CONTENT_TYPE,
      content: multilingualXlsxFixture(),
      metadata: { sourcePath: "copy/strings.xlsx" },
    });

    const entries = await loadProjectOfficeSourceEntries({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      storedFileId: storedFile.id,
      sourcePath: "copy/strings.xlsx",
    });

    expect(isOk(entries)).toBe(true);
    if (!isOk(entries)) {
      throw new Error(`expected source entries, got ${entries.error.code}`);
    }
    expect(entries.value.find((entry) => entry.key === "home.title")).toEqual(
      expect.objectContaining({
        key: "home.title",
        text: "Home",
        context: "Navigation label",
        maxLength: 12,
      }),
    );
    expect(entries.value.find((entry) => entry.key === "home.cta")).toEqual(
      expect.objectContaining({
        key: "home.cta",
        text: "Start free trial",
        context: null,
      }),
    );
    expect(entries.value.find((entry) => entry.key === "home.cta")?.maxLength).toBeUndefined();
  });

  it("reads the target column with the same source-row keys", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const storedFile = await createStoredFile({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      role: "source",
      sourceKind: "repository_file",
      filename: "strings.xlsx",
      contentType: XLSX_CONTENT_TYPE,
      content: multilingualXlsxFixture(),
      metadata: { sourcePath: "copy/strings.xlsx" },
    });

    const entries = await loadProjectOfficeTargetEntries({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      storedFileId: storedFile.id,
      sourcePath: "copy/strings.xlsx",
      targetLocale: "fr-FR",
    });

    expect(isOk(entries)).toBe(true);
    if (!isOk(entries)) {
      throw new Error(`expected target entries, got ${entries.error.code}`);
    }
    expect(entries.value).toEqual({ "home.title": "Accueil" });
  });

  it("returns unsupported_office_format for non-Office source paths", async () => {
    const result = await loadProjectOfficeSourceEntries({
      organizationId: randomUUID(),
      projectId: randomUUID(),
      storedFileId: randomUUID(),
      sourcePath: "locales/en.json",
    });

    expect(isErr(result) && result.error).toEqual({ code: "unsupported_office_format" });
  });

  it("returns source_content_not_found when the stored file is missing", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const result = await loadProjectOfficeSourceEntries({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      storedFileId: randomUUID(),
      sourcePath: "copy/strings.xlsx",
    });

    expect(isErr(result) && result.error).toEqual({ code: "source_content_not_found" });
  });
});
