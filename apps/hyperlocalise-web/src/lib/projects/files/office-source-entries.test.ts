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
import { applyDocxTranslations, DOCX_CONTENT_TYPE } from "@/lib/translation/ooxml/docx-document";
import { OOXML_TOKEN_MARKER } from "@/lib/translation/ooxml/ooxml-paragraph";
import { ooxmlFixture } from "@/lib/translation/ooxml/ooxml.fixture";
import { applyPptxTranslations, PPTX_CONTENT_TYPE } from "@/lib/translation/ooxml/pptx-deck";
import { multilingualXlsxFixture } from "@/lib/translation/xlsx/xlsx-workbook.fixture";
import { XLSX_CONTENT_TYPE } from "@/lib/translation/xlsx/xlsx-workbook";

import {
  loadProjectOfficeSourceEntries,
  loadProjectOfficeTargetEntries,
} from "./office-source-entries";

const fixture = createProjectTestFixture();

async function storeOfficeSource(input: {
  sourcePath: string;
  contentType: string;
  content: Uint8Array;
}) {
  const stored = await fixture.createStoredProjectFixture();
  const storedFile = await createStoredFile({
    organizationId: stored.organization.id,
    projectId: stored.project.id,
    role: "source",
    sourceKind: "repository_file",
    filename: input.sourcePath.split("/").at(-1)!,
    contentType: input.contentType,
    content: Buffer.from(input.content),
    metadata: { sourcePath: input.sourcePath },
  });
  return { stored, storedFile };
}

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

  it.each([
    {
      name: "docx-basic" as const,
      sourcePath: "docs/report.docx",
      contentType: DOCX_CONTENT_TYPE,
      entries: [
        {
          key: "word/document.xml#0",
          text: "Quarterly report",
          context: "Word body, style Heading1",
        },
        {
          key: "word/header1.xml#0",
          text: "Confidential",
          context: "Word header",
        },
      ],
    },
    {
      name: "pptx-basic" as const,
      sourcePath: "slides/deck.pptx",
      contentType: PPTX_CONTENT_TYPE,
      entries: [
        {
          key: "ppt/slides/slide2.xml#0",
          text: "Welcome",
          context: "Slide 1, Title 1",
        },
        {
          key: "ppt/slides/slide1.xml#0",
          text: "Price & plan",
          context: "Slide 2, Table 3, table cell",
        },
      ],
    },
  ])("maps $name paragraph location and style onto source entries", async (office) => {
    const { stored, storedFile } = await storeOfficeSource({
      sourcePath: office.sourcePath,
      contentType: office.contentType,
      content: await ooxmlFixture(office.name),
    });

    const entries = await loadProjectOfficeSourceEntries({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      storedFileId: storedFile.id,
      sourcePath: office.sourcePath,
    });

    expect(isOk(entries)).toBe(true);
    if (!isOk(entries)) {
      throw new Error(`expected source entries, got ${entries.error.code}`);
    }
    for (const expected of office.entries) {
      expect(entries.value.find((entry) => entry.key === expected.key)).toEqual(
        expect.objectContaining(expected),
      );
    }
  });

  it.each([
    {
      name: "docx-basic" as const,
      sourcePath: "docs/report.docx",
      contentType: DOCX_CONTENT_TYPE,
      apply: applyDocxTranslations,
      key: "word/document.xml#0",
      text: "Rapport trimestriel",
    },
    {
      name: "pptx-basic" as const,
      sourcePath: "slides/deck.pptx",
      contentType: PPTX_CONTENT_TYPE,
      apply: applyPptxTranslations,
      key: "ppt/slides/slide2.xml#0",
      text: "Bienvenue",
    },
  ])("reads $name target uploads with the same source-paragraph keys", async (office) => {
    const source = await ooxmlFixture(office.name);
    const translated = await office.apply(source, { [office.key]: office.text });
    expect(isOk(translated)).toBe(true);
    if (!isOk(translated)) {
      throw new Error(`expected patched ${office.name}, got ${translated.error.code}`);
    }

    const { stored, storedFile } = await storeOfficeSource({
      sourcePath: office.sourcePath,
      contentType: office.contentType,
      content: translated.value,
    });

    const entries = await loadProjectOfficeTargetEntries({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      storedFileId: storedFile.id,
      sourcePath: office.sourcePath,
      targetLocale: "fr-FR",
    });

    expect(isOk(entries)).toBe(true);
    if (!isOk(entries)) {
      throw new Error(`expected target entries, got ${entries.error.code}`);
    }
    expect(entries.value[office.key]).toBe(office.text);
  });

  it("keeps letterless target paragraphs that source ingest would drop", async () => {
    const source = await ooxmlFixture("docx-basic");
    const { stored, storedFile } = await storeOfficeSource({
      sourcePath: "docs/report.docx",
      contentType: DOCX_CONTENT_TYPE,
      content: source,
    });
    const loaded = await loadProjectOfficeSourceEntries({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      storedFileId: storedFile.id,
      sourcePath: "docs/report.docx",
    });
    if (!isOk(loaded)) {
      throw new Error(`expected source entries, got ${loaded.error.code}`);
    }
    const plain = loaded.value.find((entry) => !entry.text.includes(OOXML_TOKEN_MARKER));
    expect(plain).toBeDefined();

    const translated = await applyDocxTranslations(source, { [plain!.key]: "2026" });
    if (!isOk(translated)) {
      throw new Error(`expected patched docx, got ${translated.error.code}`);
    }
    const translatedFile = await createStoredFile({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      role: "source",
      sourceKind: "repository_file",
      filename: "report-fr.docx",
      contentType: DOCX_CONTENT_TYPE,
      content: Buffer.from(translated.value),
      metadata: { sourcePath: "docs/report.docx" },
    });

    const asSource = await loadProjectOfficeSourceEntries({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      storedFileId: translatedFile.id,
      sourcePath: "docs/report.docx",
    });
    const asTarget = await loadProjectOfficeTargetEntries({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      storedFileId: translatedFile.id,
      sourcePath: "docs/report.docx",
      targetLocale: "fr-FR",
    });
    if (!isOk(asSource) || !isOk(asTarget)) {
      throw new Error("expected source and target reads of the translated document");
    }

    expect(asSource.value.some((entry) => entry.key === plain!.key)).toBe(false);
    expect(asTarget.value[plain!.key]).toBe("2026");
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
