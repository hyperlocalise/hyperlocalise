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
import { randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { testClient } from "hono/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { db, schema } from "@/lib/database/client";
import { projectBranchService } from "@/lib/projects/branches/project-branch-service";
import {
  createRepositorySourceFileVersion,
  createStoredFile,
  ensureRepositorySourceFile,
  getStoredFileContent,
} from "@/lib/file-storage/records";
import {
  defaultRepositorySourceFileImportSettings,
  normalizeImportSettings,
  type RepositorySourceFileImportSettings,
} from "@/lib/projects/files/source-file-import-settings-schema";
import { translationSourceFingerprintSql } from "@/lib/projects/files/translation-as-source-fingerprint";
import { TRANSLATION_AS_SOURCE_UPLOAD_SURFACE } from "@/lib/projects/files/translation-as-source-support";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";
import {
  projectTranslationRevisionColumns,
  recordProjectTranslationRevisions,
  writeProjectTranslations,
} from "@/lib/projects/translations/project-translation-revisions";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";
import { DOCX_CONTENT_TYPE, readDocxEntries } from "@/lib/translation/ooxml/docx-document";
import { ooxmlFixture } from "@/lib/translation/ooxml/ooxml.fixture";
import { buildXlsxFixture } from "@/lib/translation/xlsx/xlsx-workbook.fixture";
import {
  loadXlsxWorkbook,
  readXlsxEntries,
  XLSX_CONTENT_TYPE,
} from "@/lib/translation/xlsx/xlsx-workbook";

import { createMemoryFileStorageAdapter } from "../file/file.fixture";
import { createProjectTestFixture } from "./project.fixture";

const {
  resolveApiAuthContextFromSessionMock,
  enqueueSourceFileIngestAfterUploadMock,
  enqueueFileUploadedActivityMock,
} = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  enqueueSourceFileIngestAfterUploadMock: vi.fn(async (_input: { projectId: string }) => {}),
  enqueueFileUploadedActivityMock: vi.fn(async () => {}),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/projects/files/source-file-ingest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/projects/files/source-file-ingest")>();
  return {
    ...actual,
    enqueueSourceFileIngestAfterUpload: enqueueSourceFileIngestAfterUploadMock,
  };
});

// Each send is an upload; without this, every upload waits on the activity log's queue.
vi.mock("@/lib/activity-log/file-segment-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/activity-log/file-segment-events")>();
  return {
    ...actual,
    enqueueFileUploadedActivity: enqueueFileUploadedActivityMock,
  };
});

const SOURCE_PATH = "requests/report.docx";
const PIVOT_LOCALE = "en-US";

const fileStorageAdapter = createMemoryFileStorageAdapter();
const app = createApp({ fileStorageAdapter });
const client = testClient<AppType>(app);
const projectFixture = createProjectTestFixture();

type FixtureFile = {
  sourcePath: string;
  contentType: string;
  content: Uint8Array;
  entries: { key: string; text: string; context?: string | null }[];
  importSettings?: RepositorySourceFileImportSettings;
  /** The approved English of a string; `English for <key>` when left out. */
  english?: (entry: { key: string; sourceText: string }) => string;
};

async function wordFile(): Promise<FixtureFile> {
  const content = await ooxmlFixture("docx-basic");
  const entries = await readDocxEntries(content);
  if (!entries.ok) {
    throw new Error(`could not read fixture entries: ${entries.error.code}`);
  }
  return {
    sourcePath: SOURCE_PATH,
    contentType: DOCX_CONTENT_TYPE,
    content,
    entries: entries.value,
  };
}

type FixtureCells = Parameters<typeof buildXlsxFixture>[0][number]["cells"];

/**
 * A workbook read the way ingest reads it for a Chinese project. `keyedInSandbox` reads it as
 * an `.xlsx` file with import settings is read after the sandbox: with no source locale.
 */
async function excelFile(
  cells: FixtureCells,
  options: Pick<FixtureFile, "importSettings" | "english"> & {
    sourcePath?: string;
    moreSheets?: Parameters<typeof buildXlsxFixture>[0];
    keyedInSandbox?: boolean;
  } = {},
): Promise<FixtureFile> {
  const content = buildXlsxFixture([{ name: "Sheet1", cells }, ...(options.moreSheets ?? [])]);
  const workbook = await loadXlsxWorkbook(content);
  if (!workbook.ok) {
    throw new Error(`could not read fixture workbook: ${workbook.error.code}`);
  }
  return {
    sourcePath: options.sourcePath ?? "requests/prices.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    content,
    entries: options.keyedInSandbox
      ? readXlsxEntries(workbook.value, null, "", options.importSettings?.excel)
      : readXlsxEntries(workbook.value, "zh-CN", "zh-CN", options.importSettings?.excel),
    importSettings: options.importSettings,
    english: options.english,
  };
}

/** The cells of the sent file's first sheet, by address. */
function sentCells(content: Uint8Array): Record<string, unknown> {
  const sheet = XLSX.read(content, { type: "array" }).Sheets.Sheet1 ?? {};
  return Object.fromEntries(
    Object.entries(sheet)
      .filter(([address]) => !address.startsWith("!"))
      .map(([address, cell]) => [address, (cell as XLSX.CellObject).v]),
  );
}

/**
 * A workspace with a Chinese project whose file (a Word file unless given) is fully approved
 * in English. The file is stored with the default adapter, which is where the download builder
 * reads from.
 */
async function chainedProjectsFixture(
  options: { role?: OrganizationMembershipRole; file?: FixtureFile } = {},
) {
  const file = options.file ?? (await wordFile());
  const { identity, organization, user } = await projectFixture.createLocalWorkosIdentity(
    projectFixture.createWorkosIdentityWithRole(options.role ?? "admin"),
  );
  const team = await ensureDefaultWorkspaceTeam(organization.id);
  const insertProject = async (values: {
    name: string;
    sourceLocale: string;
    targetLocales: string[];
  }) => {
    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        identifier: uniqueTestProjectIdentifier(),
        organizationId: organization.id,
        teamId: team.id,
        createdByUserId: user.id,
        description: "",
        translationContext: "",
        ...values,
      })
      .returning();
    return project;
  };
  const original = await insertProject({
    name: "Requests (Chinese)",
    sourceLocale: "zh-CN",
    targetLocales: [PIVOT_LOCALE, "zh-TW"],
  });
  const destination = await insertProject({
    name: "Requests (English)",
    sourceLocale: PIVOT_LOCALE,
    targetLocales: ["de-DE"],
  });
  const unrelated = await insertProject({
    name: "Website",
    sourceLocale: "fr-FR",
    targetLocales: ["de-DE"],
  });

  const sourceFile = await ensureRepositorySourceFile({
    organizationId: organization.id,
    projectId: original.id,
    sourcePath: file.sourcePath,
  });
  if (file.importSettings) {
    await db
      .update(schema.repositorySourceFiles)
      .set({ importSettings: file.importSettings })
      .where(eq(schema.repositorySourceFiles.id, sourceFile.id));
  }
  const storedFile = await createStoredFile({
    organizationId: organization.id,
    projectId: original.id,
    createdByUserId: user.id,
    role: "source",
    sourceKind: "repository_file",
    filename: file.sourcePath.split("/").pop() ?? file.sourcePath,
    contentType: file.contentType,
    content: Buffer.from(file.content),
  });
  const version = await createRepositorySourceFileVersion({
    storedFile,
    sourcePath: file.sourcePath,
  });
  await db
    .update(schema.repositorySourceFileVersions)
    .set({ ingestState: "ingested" })
    .where(eq(schema.repositorySourceFileVersions.id, version.id));

  await upsertProjectTranslationKeysFromEntries({
    organizationId: organization.id,
    projectId: original.id,
    repositorySourceFileId: sourceFile.id,
    entries: file.entries.map((entry) => ({ ...entry, context: entry.context ?? null })),
  });
  const keys = await db
    .select({
      id: schema.projectTranslationKeys.id,
      key: schema.projectTranslationKeys.key,
      sourceText: schema.projectTranslationKeys.sourceText,
    })
    .from(schema.projectTranslationKeys)
    .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id));
  await db.insert(schema.projectTranslations).values(
    keys.map((key) => ({
      organizationId: organization.id,
      projectId: original.id,
      translationKeyId: key.id,
      targetLocale: PIVOT_LOCALE,
      text: file.english?.(key) ?? `English for ${key.key}`,
      status: "approved" as const,
      provenance: "import" as const,
    })),
  );

  const headers = await projectFixture.authHeadersFor(identity);
  const route =
    client.api.orgs[":organizationSlug"].projects[":projectId"].files["translation-source"];
  const param = {
    organizationSlug: identity.organization.slug ?? "missing-slug",
    projectId: original.id,
  };

  return {
    identity,
    organization,
    user,
    original,
    destination,
    unrelated,
    version,
    keys,
    destinations: () => route.destinations.$get({ param }, { headers }),
    sent: (otherHeaders?: Record<string, string>) =>
      route.sent.$get({ param }, { headers: otherHeaders ?? headers }),
    /** The destination's files sent there from another project. */
    received: (otherHeaders?: Record<string, string>) =>
      route.received.$get(
        { param: { ...param, projectId: destination.id } },
        { headers: otherHeaders ?? headers },
      ),
    /** What the destination has where the fixture file would be sent. */
    destinationFile: () =>
      route["destination-file"].$get(
        { param, query: { sourcePath: file.sourcePath, destinationProjectId: destination.id } },
        { headers },
      ),
    send: (
      json: { sourcePath?: string; destinationProjectId?: string; replaceVersionId?: string } = {},
    ) =>
      route.$post(
        {
          param,
          json: {
            sourcePath: json.sourcePath ?? file.sourcePath,
            destinationProjectId: json.destinationProjectId ?? destination.id,
            replaceVersionId: json.replaceVersionId,
          },
        },
        { headers },
      ),
    destinationVersions: () =>
      db
        .select()
        .from(schema.repositorySourceFileVersions)
        .where(
          and(
            eq(schema.repositorySourceFileVersions.organizationId, organization.id),
            eq(schema.repositorySourceFileVersions.projectId, destination.id),
          ),
        )
        .orderBy(desc(schema.repositorySourceFileVersions.createdAt)),
    /** The newest file sent to the destination: its version, content and import settings. */
    sentFile: async () => {
      const [sentVersion] = await db
        .select()
        .from(schema.repositorySourceFileVersions)
        .where(eq(schema.repositorySourceFileVersions.projectId, destination.id))
        .orderBy(desc(schema.repositorySourceFileVersions.createdAt));
      const [sentFile] = await db
        .select({ importSettings: schema.repositorySourceFiles.importSettings })
        .from(schema.repositorySourceFiles)
        .where(eq(schema.repositorySourceFiles.id, sentVersion.repositorySourceFileId));
      const stored = await getStoredFileContent({
        organizationId: organization.id,
        projectId: destination.id,
        fileId: sentVersion.storedFileId,
        adapter: fileStorageAdapter,
      });
      return {
        version: sentVersion,
        content: stored.content,
        importSettings: normalizeImportSettings(sentFile.importSettings),
      };
    },
  };
}

/** A file put in the destination at the fixture file's path, not by a send from it. */
async function addToDestination(
  fixture: Awaited<ReturnType<typeof chainedProjectsFixture>>,
  options: {
    content?: string;
    sourcePath?: string;
    uploadSurface?: string;
    uploadedByUserId?: string;
    branchName?: string;
  } = {},
) {
  const sourcePath = options.sourcePath ?? SOURCE_PATH;
  const storedFile = await createStoredFile({
    organizationId: fixture.organization.id,
    projectId: fixture.destination.id,
    role: "source",
    sourceKind: "repository_file",
    filename: sourcePath.split("/").pop() ?? sourcePath,
    contentType: DOCX_CONTENT_TYPE,
    content: Buffer.from(options.content ?? "uploaded by hand"),
  });
  return createRepositorySourceFileVersion({
    storedFile,
    sourcePath,
    branchName: options.branchName,
    uploadSurface: options.uploadSurface ?? "files_page",
    uploadedByUserId: options.uploadedByUserId ?? null,
  });
}

type ChainedProjects = Awaited<ReturnType<typeof chainedProjectsFixture>>;

/**
 * Saves a translation of the fixture's first string through the app's history writer, which
 * keeps a translation's earlier text when its first change is recorded.
 */
async function saveTranslation(
  fixture: ChainedProjects,
  values: { locale?: string; text?: string; status: "approved" | "needs_review" },
) {
  const key = fixture.keys[0];
  const locale = values.locale ?? PIVOT_LOCALE;
  await writeProjectTranslations(
    db,
    {
      organizationId: fixture.organization.id,
      translationKeyIds: [key.id],
      targetLocales: [locale],
    },
    async (tx, before) => {
      const previous = [...before.values()][0];
      const saved = await tx
        .insert(schema.projectTranslations)
        .values({
          organizationId: fixture.organization.id,
          projectId: fixture.original.id,
          translationKeyId: key.id,
          targetLocale: locale,
          text: values.text ?? previous?.text ?? "",
          status: values.status,
          provenance: "manual",
        })
        .onConflictDoUpdate({
          target: [
            schema.projectTranslations.translationKeyId,
            schema.projectTranslations.targetLocale,
          ],
          set: { text: sql`excluded.text`, status: sql`excluded.status`, updatedAt: sql`now()` },
        })
        .returning(projectTranslationRevisionColumns);
      await recordProjectTranslationRevisions(tx, { before, saved });
    },
  );
}

/** Whether the file shows as changed since its last send. */
async function changedSinceSent(fixture: ChainedProjects) {
  const response = await fixture.sent();
  const body = await response.json();
  if (!("sends" in body)) {
    throw new Error("could not list the sends");
  }
  return body.sends.map((send) => send.changedSinceSent);
}

describe("translation as source routes", () => {
  beforeEach(() => {
    enqueueSourceFileIngestAfterUploadMock.mockClear();
  });

  afterEach(async () => {
    await projectFixture.cleanup();
  });

  it("lists the projects whose source language is one of this project's languages", async () => {
    const fixture = await chainedProjectsFixture();
    await db
      .update(schema.projects)
      .set({ approvedTranslationsOnSourceChange: "needs_review" })
      .where(eq(schema.projects.id, fixture.destination.id));

    const response = await fixture.destinations();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      destinations: [
        {
          id: fixture.destination.id,
          name: "Requests (English)",
          sourceLocale: PIVOT_LOCALE,
          keepsApprovedOnSourceChange: false,
        },
      ],
    });
  });

  it("uploads the approved translation to the other project under the same path", async () => {
    const fixture = await chainedProjectsFixture();

    const response = await fixture.send();

    expect(response.status).toBe(201);
    const [version] = await fixture.destinationVersions();
    expect(await response.json()).toEqual({
      file: {
        destinationProjectId: fixture.destination.id,
        sourcePath: SOURCE_PATH,
        sourceFileVersionId: version.id,
        stringCount: fixture.keys.length,
      },
    });
    expect(version).toMatchObject({
      sourcePath: SOURCE_PATH,
      uploadSurface: TRANSLATION_AS_SOURCE_UPLOAD_SURFACE,
    });

    const [storedFile] = await db
      .select({ metadata: schema.storedFiles.metadata })
      .from(schema.storedFiles)
      .where(eq(schema.storedFiles.id, version.storedFileId));
    expect(storedFile.metadata).toMatchObject({
      translationSource: {
        projectId: fixture.original.id,
        locale: PIVOT_LOCALE,
        sourceFileVersionId: fixture.version.id,
        fingerprint: expect.stringMatching(/^[0-9a-f]{32}$/),
      },
    });

    // The sent file reads back with the original's keys, now holding the English text.
    // Placeholders the English left out are appended, so only the start of each text is known.
    const sent = await getStoredFileContent({
      organizationId: fixture.organization.id,
      projectId: fixture.destination.id,
      fileId: version.storedFileId,
      adapter: fileStorageAdapter,
    });
    const entries = await readDocxEntries(sent.content);
    if (!entries.ok) {
      throw new Error(`could not read the sent file: ${entries.error.code}`);
    }
    expect(entries.value.map((entry) => entry.key).sort()).toEqual(
      fixture.keys.map((key) => key.key).sort(),
    );
    for (const entry of entries.value) {
      expect(entry.text.startsWith(`English for ${entry.key}`)).toBe(true);
    }

    expect(enqueueSourceFileIngestAfterUploadMock).toHaveBeenCalledTimes(1);
    expect(enqueueSourceFileIngestAfterUploadMock.mock.calls[0][0]).toMatchObject({
      projectId: fixture.destination.id,
      sourceFileVersionId: version.id,
      sourcePath: SOURCE_PATH,
    });
  });

  it("keeps the path as it is written, capital letters in the extension included", async () => {
    const fixture = await chainedProjectsFixture({
      file: { ...(await wordFile()), sourcePath: "requests/REPORT.DOCX" },
    });

    const response = await fixture.send();

    expect(response.status).toBe(201);
    expect((await fixture.sentFile()).version.sourcePath).toBe("requests/REPORT.DOCX");
  });

  it("refuses while a string has no approved translation, and names it", async () => {
    const fixture = await chainedProjectsFixture();
    const [unapproved] = fixture.keys;
    await db
      .update(schema.projectTranslations)
      .set({ status: "needs_review" })
      .where(eq(schema.projectTranslations.translationKeyId, unapproved.id));

    const response = await fixture.send();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "translations_not_approved",
      details: {
        missingCount: 1,
        totalCount: fixture.keys.length,
        missingStrings: [{ key: unapproved.key, sourceText: unapproved.sourceText }],
      },
    });
    expect(await fixture.destinationVersions()).toEqual([]);
    expect(enqueueSourceFileIngestAfterUploadMock).not.toHaveBeenCalled();
  });

  it("counts a string hidden by hand as missing while the file still has it", async () => {
    const fixture = await chainedProjectsFixture();
    const [hidden] = fixture.keys;
    await db
      .delete(schema.projectTranslations)
      .where(eq(schema.projectTranslations.translationKeyId, hidden.id));
    await db
      .update(schema.projectTranslationKeys)
      .set({ isHidden: true })
      .where(eq(schema.projectTranslationKeys.id, hidden.id));

    const response = await fixture.send();

    // Its paragraph would arrive in the original language otherwise.
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "translations_not_approved",
      details: {
        missingCount: 1,
        missingStrings: [{ key: hidden.key, sourceText: hidden.sourceText }],
      },
    });
    expect(await fixture.destinationVersions()).toEqual([]);
  });

  it("sends again under the same path and replaces the other project's import settings", async () => {
    const fixture = await chainedProjectsFixture({
      file: await excelFile({ A1: "姓名", A2: "张三" }),
    });
    expect((await fixture.send()).status).toBe(201);
    const first = await fixture.sentFile();
    // Settings saved in the other project would make it read the file differently.
    await db
      .update(schema.repositorySourceFiles)
      .set({
        importSettings: {
          ...defaultRepositorySourceFileImportSettings(),
          excel: { columns: { source: 3 } },
        },
      })
      .where(eq(schema.repositorySourceFiles.id, first.version.repositorySourceFileId));

    expect((await fixture.send()).status).toBe(201);

    const versions = await fixture.destinationVersions();
    expect(versions.map((version) => version.sourcePath)).toEqual([
      "requests/prices.xlsx",
      "requests/prices.xlsx",
    ]);
    expect(new Set(versions.map((version) => version.repositorySourceFileId)).size).toBe(1);
    expect((await fixture.sentFile()).importSettings).toEqual(
      defaultRepositorySourceFileImportSettings(),
    );
  });

  it("refuses a file that cannot be written in the other project's language", async () => {
    const fixture = await chainedProjectsFixture();
    // A newest upload, read already, whose content is no Word file the writer can open.
    const broken = await createStoredFile({
      organizationId: fixture.organization.id,
      projectId: fixture.original.id,
      role: "source",
      sourceKind: "repository_file",
      filename: "report.docx",
      contentType: DOCX_CONTENT_TYPE,
      content: Buffer.from("not a Word file"),
    });
    const version = await createRepositorySourceFileVersion({
      storedFile: broken,
      sourcePath: SOURCE_PATH,
    });
    await db
      .update(schema.repositorySourceFileVersions)
      .set({ ingestState: "ingested" })
      .where(eq(schema.repositorySourceFileVersions.id, version.id));

    const response = await fixture.send();

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "file_cannot_be_written" });
    expect(await fixture.destinationVersions()).toEqual([]);
  });

  it("refuses a file whose newest upload could not be read", async () => {
    const fixture = await chainedProjectsFixture();
    await db
      .update(schema.repositorySourceFileVersions)
      .set({ ingestState: "failed" })
      .where(eq(schema.repositorySourceFileVersions.id, fixture.version.id));

    const response = await fixture.send();

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "source_file_read_failed" });
  });

  it("refuses a file whose newest version is still being read", async () => {
    const fixture = await chainedProjectsFixture();
    await db
      .update(schema.repositorySourceFileVersions)
      .set({ ingestState: "ingesting" })
      .where(eq(schema.repositorySourceFileVersions.id, fixture.version.id));

    const response = await fixture.send();

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "source_file_not_ready" });
  });

  it("sends an Excel file read cell by cell with each cell's translation in place", async () => {
    const fixture = await chainedProjectsFixture({
      file: await excelFile({ A1: "姓名", B1: "部门", A2: "张三", B2: "销售", C2: 42 }),
    });

    const response = await fixture.send();

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      file: { sourcePath: "requests/prices.xlsx", stringCount: 4 },
    });
    const sent = await fixture.sentFile();
    expect(sentCells(sent.content)).toEqual({
      A1: "English for Sheet1!A1",
      B1: "English for Sheet1!B1",
      A2: "English for Sheet1!A2",
      B2: "English for Sheet1!B2",
      C2: 42,
    });
    // Nothing to copy: the original has no import settings of its own.
    expect(sent.importSettings).toEqual(defaultRepositorySourceFileImportSettings());
  });

  it("sends a sheet with a column per language with English in its column", async () => {
    const fixture = await chainedProjectsFixture({
      file: await excelFile({
        A1: "Key",
        B1: "zh-CN",
        A2: "welcome.title",
        B2: "欢迎",
        A3: "welcome.body",
        B3: "正文",
      }),
    });

    const response = await fixture.send();

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ file: { stringCount: 2 } });
    expect(sentCells((await fixture.sentFile()).content)).toEqual({
      A1: "Key",
      B1: "zh-CN",
      C1: PIVOT_LOCALE,
      A2: "welcome.title",
      B2: "欢迎",
      C2: "English for welcome.title",
      A3: "welcome.body",
      B3: "正文",
      C3: "English for welcome.body",
    });
  });

  it("writes an Excel file with its own columns through them and copies the settings", async () => {
    const importSettings: RepositorySourceFileImportSettings = {
      ...defaultRepositorySourceFileImportSettings(),
      excel: { firstLineContainsHeader: true, columns: { identifier: 0, source: 1, context: 2 } },
    };
    const fixture = await chainedProjectsFixture({
      file: await excelFile(
        {
          A1: "编号",
          B1: "内容",
          C1: "备注",
          A2: "welcome.title",
          B2: "欢迎",
          C2: "首页",
          A3: "welcome.body",
          B3: "正文",
        },
        { importSettings },
      ),
    });
    expect(fixture.keys.map((key) => key.key).sort()).toEqual(["welcome.body", "welcome.title"]);

    const response = await fixture.send();

    expect(response.status).toBe(201);
    const sent = await fixture.sentFile();
    expect(sentCells(sent.content)).toEqual({
      A1: "编号",
      B1: "内容",
      C1: "备注",
      A2: "welcome.title",
      B2: "English for welcome.title",
      C2: "首页",
      A3: "welcome.body",
      B3: "English for welcome.body",
    });
    expect(sent.importSettings).toEqual(importSettings);
  });

  it("refuses an Excel file whose translated first row would change how it is read", async () => {
    // "English" in the first row makes an English-source project read the sheet by rows.
    const fixture = await chainedProjectsFixture({
      file: await excelFile(
        { A1: "中文", B1: "英文", A2: "你好", B2: "问候" },
        { english: (entry) => (entry.sourceText === "英文" ? "English" : `en ${entry.key}`) },
      ),
    });

    const response = await fixture.send();

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "file_reads_differently" });
    expect(await fixture.destinationVersions()).toEqual([]);
    expect(enqueueSourceFileIngestAfterUploadMock).not.toHaveBeenCalled();
  });

  it("refuses an Excel file when a string would not arrive", async () => {
    // The English column's formula is left alone, so "k1" has nowhere to be written.
    const fixture = await chainedProjectsFixture({
      file: await excelFile({
        A1: "Key",
        B1: "zh-CN",
        C1: PIVOT_LOCALE,
        A2: "k1",
        B2: "欢迎",
        C2: { formula: "B2", cached: "欢迎" },
        A3: "k2",
        B3: "正文",
      }),
    });
    expect(fixture.keys.map((key) => key.key).sort()).toEqual(["k1", "k2"]);

    const response = await fixture.send();

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "file_reads_differently" });
    expect(await fixture.destinationVersions()).toEqual([]);
  });

  it("refuses an Excel file whose import settings make the other project read every cell", async () => {
    // Settings without a source column: the sheet with a Chinese column is written by rows,
    // but the other project would read its cells, Chinese included.
    const fixture = await chainedProjectsFixture({
      file: await excelFile(
        { A1: "Key", B1: "Chinese", C1: "Notes", A2: "home", B2: "首页" },
        {
          importSettings: {
            ...defaultRepositorySourceFileImportSettings(),
            excel: { columns: { context: 2 } },
          },
          moreSheets: [{ name: "Intro", cells: { A1: "说明" } }],
          keyedInSandbox: true,
        },
      ),
    });

    const response = await fixture.send();

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "file_reads_differently" });
    expect(await fixture.destinationVersions()).toEqual([]);
  });

  it("sends an old .xls file as .xlsx", async () => {
    const xlsx = await excelFile({ A1: "姓名", A2: "张三" });
    const fixture = await chainedProjectsFixture({
      file: {
        ...xlsx,
        sourcePath: "requests/prices.xls",
        contentType: "application/vnd.ms-excel",
        content: new Uint8Array(
          XLSX.write(XLSX.read(xlsx.content, { type: "array" }), {
            type: "array",
            bookType: "biff8",
          }) as ArrayBuffer,
        ),
      },
    });

    const response = await fixture.send();

    expect(response.status).toBe(201);
    const sent = await fixture.sentFile();
    expect(sent.version.sourcePath).toBe("requests/prices.xlsx");
    expect(sentCells(sent.content)).toEqual({
      A1: "English for Sheet1!A1",
      A2: "English for Sheet1!A2",
    });
  });

  it("asks before replacing a file the other project has from elsewhere", async () => {
    const fixture = await chainedProjectsFixture();
    const byHand = await addToDestination(fixture, { uploadedByUserId: fixture.user.id });
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, fixture.user.id));

    expect(await (await fixture.destinationFile()).json()).toEqual({
      destinationFile: {
        state: "other",
        path: SOURCE_PATH,
        addedAt: byHand.createdAt.toISOString(),
        versionId: byHand.id,
        addedBy: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
        sentFrom: null,
      },
    });
    const refused = await fixture.send();
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: "destination_file_replaced" });
    expect(await fixture.destinationVersions()).toHaveLength(1);

    expect((await fixture.send({ replaceVersionId: byHand.id })).status).toBe(201);
    expect(await (await fixture.destinationFile()).json()).toMatchObject({
      destinationFile: { state: "sent_from_here" },
    });
    // Its own send is replaced without asking.
    expect((await fixture.send()).status).toBe(201);
  });

  it("does not replace a file that arrived after the person saw another one", async () => {
    const fixture = await chainedProjectsFixture();
    const seen = await addToDestination(fixture);
    await addToDestination(fixture, { content: "uploaded again" });

    const response = await fixture.send({ replaceVersionId: seen.id });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "destination_file_replaced" });
  });

  it("asks before replacing a file the other project's repository sync added", async () => {
    const fixture = await chainedProjectsFixture();
    const synced = await addToDestination(fixture, { uploadSurface: "gitlab_content_sync" });

    expect(await (await fixture.destinationFile()).json()).toMatchObject({
      destinationFile: { state: "from_sync", path: SOURCE_PATH, versionId: synced.id },
    });
    const refused = await fixture.send();
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: "destination_file_replaced" });

    expect((await fixture.send({ replaceVersionId: synced.id })).status).toBe(201);
  });

  it("reads and writes each project's default branch, whatever other branches have at the path", async () => {
    const fixture = await chainedProjectsFixture();
    // A newer upload on another branch of the sending project, still being read: a send that
    // read it would be refused as not ready.
    const branchStoredFile = await createStoredFile({
      organizationId: fixture.organization.id,
      projectId: fixture.original.id,
      role: "source",
      sourceKind: "repository_file",
      filename: "report.docx",
      contentType: DOCX_CONTENT_TYPE,
      content: Buffer.from("release copy"),
    });
    await createRepositorySourceFileVersion({
      storedFile: branchStoredFile,
      sourcePath: SOURCE_PATH,
      branchName: "release",
    });
    const onDestinationBranch = await addToDestination(fixture, { branchName: "release" });

    expect(await (await fixture.destinationFile()).json()).toMatchObject({
      destinationFile: { state: "empty", path: SOURCE_PATH },
    });
    const response = await fixture.send();

    expect(response.status).toBe(201);
    const sent = await fixture.sentFile();
    expect(sent.version.id).not.toBe(onDestinationBranch.id);
    const [sentFile] = await db
      .select({ branchName: schema.repositorySourceFiles.branchName })
      .from(schema.repositorySourceFiles)
      .where(eq(schema.repositorySourceFiles.id, sent.version.repositorySourceFileId));
    expect(sentFile.branchName).toBe("main");
    const [storedFile] = await db
      .select({ metadata: schema.storedFiles.metadata })
      .from(schema.storedFiles)
      .where(eq(schema.storedFiles.id, sent.version.storedFileId));
    expect(storedFile.metadata).toMatchObject({
      translationSource: { sourceFileVersionId: fixture.version.id },
    });
    // The other branch's file is left as it was, and the next send finds its own send.
    expect(await fixture.destinationVersions()).toHaveLength(2);
    expect((await fixture.send()).status).toBe(201);
  });

  it("refuses when the other project's default branch is protected", async () => {
    const fixture = await chainedProjectsFixture();
    const branch = await projectBranchService.ensureDefaultBranch({
      organizationId: fixture.organization.id,
      projectId: fixture.destination.id,
    });
    await db
      .update(schema.projectBranches)
      .set({ isProtected: true })
      .where(eq(schema.projectBranches.id, branch.id));

    const response = await fixture.send();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "destination_branch_protected" });
    expect(await fixture.destinationVersions()).toEqual([]);
  });

  it("checks the other project's .xlsx file before sending an old .xls file", async () => {
    const xlsx = await excelFile({ A1: "姓名", A2: "张三" });
    const fixture = await chainedProjectsFixture({
      file: {
        ...xlsx,
        sourcePath: "requests/prices.xls",
        contentType: "application/vnd.ms-excel",
        content: new Uint8Array(
          XLSX.write(XLSX.read(xlsx.content, { type: "array" }), {
            type: "array",
            bookType: "biff8",
          }) as ArrayBuffer,
        ),
      },
    });
    await addToDestination(fixture, { sourcePath: "requests/prices.xlsx" });

    expect((await fixture.send()).status).toBe(409);
    expect(await (await fixture.destinationFile()).json()).toMatchObject({
      destinationFile: { state: "other", path: "requests/prices.xlsx" },
    });
  });

  it("lists the file's last send to each project, unchanged until a translation changes", async () => {
    const fixture = await chainedProjectsFixture();
    expect(await (await fixture.sent()).json()).toEqual({ sends: [] });

    expect((await fixture.send()).status).toBe(201);
    expect((await fixture.send()).status).toBe(201);

    const [lastSent] = await fixture.destinationVersions();
    const response = await fixture.sent();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sends: [
        {
          sourcePath: SOURCE_PATH,
          destinationProjectId: fixture.destination.id,
          destinationProjectName: "Requests (English)",
          locale: PIVOT_LOCALE,
          sentAt: lastSent.createdAt.toISOString(),
          changedSinceSent: false,
          replacedInDestination: false,
        },
      ],
    });

    await saveTranslation(fixture, { text: "Better English", status: "approved" });
    expect(await changedSinceSent(fixture)).toEqual([true]);

    expect((await fixture.send()).status).toBe(201);
    expect(await changedSinceSent(fixture)).toEqual([false]);
  });

  it("counts a translation sent back to review until it is approved again as it was", async () => {
    const fixture = await chainedProjectsFixture();
    expect((await fixture.send()).status).toBe(201);

    await saveTranslation(fixture, { text: "Draft English", status: "needs_review" });
    expect(await changedSinceSent(fixture)).toEqual([true]);

    await saveTranslation(fixture, {
      text: `English for ${fixture.keys[0].key}`,
      status: "approved",
    });
    expect(await changedSinceSent(fixture)).toEqual([false]);
  });

  it("does not count another language, a dropped string, or a translation saved unchanged", async () => {
    const fixture = await chainedProjectsFixture();
    expect((await fixture.send()).status).toBe(201);

    await saveTranslation(fixture, { locale: "zh-TW", text: "繁體中文", status: "approved" });
    expect(await changedSinceSent(fixture)).toEqual([false]);

    await saveTranslation(fixture, { status: "approved" });
    expect(await changedSinceSent(fixture)).toEqual([false]);

    // A string an upload dropped is hidden and not in the file, so its translation is not sent.
    await db
      .update(schema.projectTranslationKeys)
      .set({ isHidden: true, hiddenBySyncAt: new Date() })
      .where(eq(schema.projectTranslationKeys.id, fixture.keys[0].id));
    expect((await fixture.send()).status).toBe(201);
    await saveTranslation(fixture, { text: "Better English", status: "approved" });
    expect(await changedSinceSent(fixture)).toEqual([false]);
  });

  it("counts hiding a string by hand only while it has no approved translation", async () => {
    const fixture = await chainedProjectsFixture();
    expect((await fixture.send()).status).toBe(201);
    const hide = (keyIndex: number, isHidden: boolean) =>
      db
        .update(schema.projectTranslationKeys)
        .set({ isHidden })
        .where(eq(schema.projectTranslationKeys.id, fixture.keys[keyIndex].id));
    const fingerprint = async () => {
      const result = await db.execute<{ fingerprint: string }>(
        sql`select ${translationSourceFingerprintSql({
          organizationId: fixture.organization.id,
          projectId: fixture.original.id,
          repositorySourceFileId: fixture.version.repositorySourceFileId,
          locale: PIVOT_LOCALE,
        })} as fingerprint`,
      );
      return result.rows[0].fingerprint;
    };

    // Its approved translation is written into the file either way.
    await hide(0, true);
    expect(await changedSinceSent(fixture)).toEqual([false]);

    // Hiding one still waiting for approval decides whether a send is refused.
    await db
      .update(schema.projectTranslations)
      .set({ status: "needs_review" })
      .where(eq(schema.projectTranslations.translationKeyId, fixture.keys[1].id));
    const waiting = await fingerprint();
    await hide(1, true);
    expect(await fingerprint()).not.toBe(waiting);
  });

  it("counts a change to the file's import settings", async () => {
    const fixture = await chainedProjectsFixture();
    expect((await fixture.send()).status).toBe(201);

    await db
      .update(schema.repositorySourceFiles)
      .set({
        importSettings: {
          ...defaultRepositorySourceFileImportSettings(),
          excel: { firstLineContainsHeader: false, columns: { source: 1 } },
        },
      })
      .where(eq(schema.repositorySourceFiles.id, fixture.version.repositorySourceFileId));

    expect(await changedSinceSent(fixture)).toEqual([true]);
  });

  it("lists in the other project where each file sent there came from", async () => {
    const fixture = await chainedProjectsFixture();
    expect(await (await fixture.received()).json()).toEqual({ received: [] });

    expect((await fixture.send()).status).toBe(201);

    const [sentVersion] = await fixture.destinationVersions();
    const response = await fixture.received();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      received: [
        {
          sourcePath: SOURCE_PATH,
          fromProjectName: fixture.original.name,
          locale: PIVOT_LOCALE,
          receivedAt: sentVersion.createdAt.toISOString(),
          replaced: null,
        },
      ],
    });

    // A file uploaded there by hand since is that project's own again.
    const byHand = await createStoredFile({
      organizationId: fixture.organization.id,
      projectId: fixture.destination.id,
      role: "source",
      sourceKind: "repository_file",
      filename: "report.docx",
      contentType: DOCX_CONTENT_TYPE,
      content: Buffer.from("uploaded by hand"),
    });
    await createRepositorySourceFileVersion({ storedFile: byHand, sourcePath: SOURCE_PATH });
    expect(await (await fixture.received()).json()).toEqual({ received: [] });
  });

  it("does not count a copy of a sent file on another branch of the other project", async () => {
    const fixture = await chainedProjectsFixture();
    expect((await fixture.send()).status).toBe(201);
    const [sentVersion] = await fixture.destinationVersions();
    // A branch created in the other project copies its files' newest versions, stored file included.
    const [storedFile] = await db
      .select()
      .from(schema.storedFiles)
      .where(eq(schema.storedFiles.id, sentVersion.storedFileId));
    await createRepositorySourceFileVersion({
      storedFile,
      sourcePath: SOURCE_PATH,
      branchName: "release",
      uploadSurface: TRANSLATION_AS_SOURCE_UPLOAD_SURFACE,
    });

    expect(await (await fixture.sent()).json()).toMatchObject({
      sends: [{ sentAt: sentVersion.createdAt.toISOString(), replacedInDestination: false }],
    });
    // One entry: arrays match by length too.
    expect(await (await fixture.received()).json()).toMatchObject({
      received: [{ receivedAt: sentVersion.createdAt.toISOString() }],
    });
  });

  it("marks a send replaced since, and says in the other project what a send replaced", async () => {
    const fixture = await chainedProjectsFixture();
    expect((await fixture.send()).status).toBe(201);
    const byHand = await addToDestination(fixture, { uploadedByUserId: fixture.user.id });

    expect(await (await fixture.sent()).json()).toMatchObject({
      sends: [{ replacedInDestination: true }],
    });
    expect(await (await fixture.received()).json()).toEqual({ received: [] });

    expect((await fixture.send({ replaceVersionId: byHand.id })).status).toBe(201);
    expect(await (await fixture.sent()).json()).toMatchObject({
      sends: [{ replacedInDestination: false }],
    });
    expect(await (await fixture.received()).json()).toMatchObject({
      received: [
        {
          sourcePath: SOURCE_PATH,
          replaced: { addedAt: byHand.createdAt.toISOString(), addedBy: expect.any(String) },
        },
      ],
    });

    // A send that replaces the last send from the same file replaced nothing worth naming.
    await saveTranslation(fixture, { text: "Better English", status: "approved" });
    expect((await fixture.send()).status).toBe(201);
    expect(await (await fixture.received()).json()).toMatchObject({
      received: [{ replaced: null }],
    });
  });

  it("does not name the project a file came from to someone who cannot open it", async () => {
    const fixture = await chainedProjectsFixture();
    expect((await fixture.send()).status).toBe(201);
    const [otherTeam] = await db
      .insert(schema.teams)
      .values({ organizationId: fixture.organization.id, slug: "chinese", name: "Chinese" })
      .returning();
    await db
      .update(schema.projects)
      .set({ teamId: otherTeam.id })
      .where(eq(schema.projects.id, fixture.original.id));
    const developer = projectFixture.createWorkosIdentityForOrganization(
      fixture.identity.organization,
      "developer",
    );
    await projectFixture.authHeadersFor(developer);
    await db.insert(schema.teamMemberships).values({
      teamId: fixture.destination.teamId!,
      userId: await projectFixture.getLocalUserId(developer.user.workosUserId),
      role: "member",
    });

    const response = await fixture.received(await projectFixture.authHeadersFor(developer));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      received: [{ sourcePath: SOURCE_PATH, fromProjectName: null }],
    });
  });

  it("does not list a send to a project the person cannot open", async () => {
    const fixture = await chainedProjectsFixture();
    expect((await fixture.send()).status).toBe(201);
    const [otherTeam] = await db
      .insert(schema.teams)
      .values({ organizationId: fixture.organization.id, slug: "english", name: "English" })
      .returning();
    await db
      .update(schema.projects)
      .set({ teamId: otherTeam.id })
      .where(eq(schema.projects.id, fixture.destination.id));
    const developer = projectFixture.createWorkosIdentityForOrganization(
      fixture.identity.organization,
      "developer",
    );
    await projectFixture.authHeadersFor(developer);
    await db.insert(schema.teamMemberships).values({
      teamId: fixture.original.teamId!,
      userId: await projectFixture.getLocalUserId(developer.user.workosUserId),
      role: "member",
    });

    const response = await fixture.sent(await projectFixture.authHeadersFor(developer));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sends: [] });
    expect(await changedSinceSent(fixture)).toEqual([false]);
  });

  it("counts a new upload of the file with other content as a change", async () => {
    const fixture = await chainedProjectsFixture();
    expect((await fixture.send()).status).toBe(201);
    const upload = async (content: Uint8Array) => {
      const storedFile = await createStoredFile({
        organizationId: fixture.organization.id,
        projectId: fixture.original.id,
        role: "source",
        sourceKind: "repository_file",
        filename: "report.docx",
        contentType: DOCX_CONTENT_TYPE,
        content: Buffer.from(content),
      });
      await createRepositorySourceFileVersion({ storedFile, sourcePath: SOURCE_PATH });
    };

    // The same bytes again: the fixture's own stored file, since a new build stamps new zip times.
    const [sameFile] = await db
      .select()
      .from(schema.storedFiles)
      .where(eq(schema.storedFiles.id, fixture.version.storedFileId));
    await createRepositorySourceFileVersion({ storedFile: sameFile, sourcePath: SOURCE_PATH });
    expect(await changedSinceSent(fixture)).toEqual([false]);

    await upload(new TextEncoder().encode("another file"));
    expect(await changedSinceSent(fixture)).toEqual([true]);
  });

  it("refuses files that are not Word or Excel files", async () => {
    const fixture = await chainedProjectsFixture();

    const response = await fixture.send({ sourcePath: "requests/deck.pptx" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unsupported_file_format" });
  });

  it("refuses a project whose source language is not one of this project's languages", async () => {
    const fixture = await chainedProjectsFixture();

    const response = await fixture.send({ destinationProjectId: fixture.unrelated.id });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "locale_not_a_target" });
    expect(enqueueSourceFileIngestAfterUploadMock).not.toHaveBeenCalled();
  });

  it("refuses sending a file to the same project", async () => {
    const fixture = await chainedProjectsFixture();

    const response = await fixture.send({ destinationProjectId: fixture.original.id });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "same_project" });
    expect(enqueueSourceFileIngestAfterUploadMock).not.toHaveBeenCalled();
  });

  it("refuses a live TMS project that stores files outside the workspace", async () => {
    const fixture = await chainedProjectsFixture();
    await db
      .update(schema.projects)
      .set({ source: "external_tms" })
      .where(eq(schema.projects.id, fixture.destination.id));

    const response = await fixture.send();

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "project_not_native" });
    expect(enqueueSourceFileIngestAfterUploadMock).not.toHaveBeenCalled();
  });

  it("refuses a project that has no source language", async () => {
    const fixture = await chainedProjectsFixture();
    await db
      .update(schema.projects)
      .set({ sourceLocale: null })
      .where(eq(schema.projects.id, fixture.destination.id));

    const response = await fixture.send();

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "destination_source_locale_mismatch",
    });
    expect(enqueueSourceFileIngestAfterUploadMock).not.toHaveBeenCalled();
  });

  it("does not find a project in another workspace", async () => {
    const fixture = await chainedProjectsFixture();
    const other = await chainedProjectsFixture();

    const response = await fixture.send({ destinationProjectId: other.destination.id });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "destination_project_not_found" });
  });

  it("is refused for roles that may not upload files", async () => {
    const fixture = await chainedProjectsFixture({ role: "translator" });

    const response = await fixture.send();

    expect(response.status).toBe(403);
    expect(await fixture.destinationVersions()).toEqual([]);
  });
});
