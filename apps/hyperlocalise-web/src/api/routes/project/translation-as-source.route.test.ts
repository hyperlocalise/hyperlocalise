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

import { and, desc, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { db, schema } from "@/lib/database/client";
import {
  createRepositorySourceFileVersion,
  createStoredFile,
  ensureRepositorySourceFile,
  getStoredFileContent,
} from "@/lib/file-storage/records";
import { TRANSLATION_AS_SOURCE_UPLOAD_SURFACE } from "@/lib/projects/files/translation-as-source";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";
import { DOCX_CONTENT_TYPE, readDocxEntries } from "@/lib/translation/ooxml/docx-document";
import { ooxmlFixture } from "@/lib/translation/ooxml/ooxml.fixture";

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

/**
 * A workspace with a Chinese project whose Word file is fully approved in English. The file
 * is stored with the default adapter, which is where the download builder reads from.
 */
async function chainedProjectsFixture(role: OrganizationMembershipRole = "admin") {
  const { identity, organization, user } = await projectFixture.createLocalWorkosIdentity(
    projectFixture.createWorkosIdentityWithRole(role),
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

  const content = await ooxmlFixture("docx-basic");
  const sourceFile = await ensureRepositorySourceFile({
    organizationId: organization.id,
    projectId: original.id,
    sourcePath: SOURCE_PATH,
  });
  const storedFile = await createStoredFile({
    organizationId: organization.id,
    projectId: original.id,
    createdByUserId: user.id,
    role: "source",
    sourceKind: "repository_file",
    filename: "report.docx",
    contentType: DOCX_CONTENT_TYPE,
    content: Buffer.from(content),
  });
  const version = await createRepositorySourceFileVersion({ storedFile, sourcePath: SOURCE_PATH });
  await db
    .update(schema.repositorySourceFileVersions)
    .set({ ingestState: "ingested" })
    .where(eq(schema.repositorySourceFileVersions.id, version.id));

  const entries = await readDocxEntries(content);
  if (!entries.ok) {
    throw new Error(`could not read fixture entries: ${entries.error.code}`);
  }
  await upsertProjectTranslationKeysFromEntries({
    organizationId: organization.id,
    projectId: original.id,
    repositorySourceFileId: sourceFile.id,
    entries: entries.value.map((entry) => ({ ...entry, context: entry.context ?? null })),
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
      text: `English for ${key.key}`,
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
    organization,
    original,
    destination,
    unrelated,
    version,
    keys,
    destinations: () => route.destinations.$get({ param }, { headers }),
    send: (json: { sourcePath?: string; destinationProjectId?: string } = {}) =>
      route.$post(
        {
          param,
          json: {
            sourcePath: json.sourcePath ?? SOURCE_PATH,
            destinationProjectId: json.destinationProjectId ?? destination.id,
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
  };
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

  it("does not count hidden strings as missing", async () => {
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

    expect(response.status).toBe(201);
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

  it("refuses files that are not Word documents", async () => {
    const fixture = await chainedProjectsFixture();

    const response = await fixture.send({ sourcePath: "requests/prices.xlsx" });

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

  it("does not find a project in another workspace", async () => {
    const fixture = await chainedProjectsFixture();
    const other = await chainedProjectsFixture();

    const response = await fixture.send({ destinationProjectId: other.destination.id });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "destination_project_not_found" });
  });

  it("is refused for roles that may not upload files", async () => {
    const fixture = await chainedProjectsFixture("translator");

    const response = await fixture.send();

    expect(response.status).toBe(403);
    expect(await fixture.destinationVersions()).toEqual([]);
  });
});
