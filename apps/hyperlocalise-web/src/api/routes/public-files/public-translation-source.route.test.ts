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

import { and, desc, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import { projectBranchService } from "@/lib/projects/branches/project-branch-service";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import {
  createRepositorySourceFileVersion,
  createStoredFile,
  ensureRepositorySourceFile,
} from "@/lib/file-storage/records";
import { TRANSLATION_AS_SOURCE_UPLOAD_SURFACE } from "@/lib/projects/files/translation-as-source-support";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";
import { DOCX_CONTENT_TYPE, readDocxEntries } from "@/lib/translation/ooxml/docx-document";
import { ooxmlFixture } from "@/lib/translation/ooxml/ooxml.fixture";

import {
  cleanupPublicApiFixture,
  createMemoryFileStorageAdapter,
  createPublicApiFixture,
  hashApiKey,
} from "./public-files.fixture";

const { enqueueSourceFileIngestAfterUploadMock, enqueueFileUploadedActivityMock } = vi.hoisted(
  () => ({
    enqueueSourceFileIngestAfterUploadMock: vi.fn(async (_input: { projectId: string }) => {}),
    enqueueFileUploadedActivityMock: vi.fn(async () => {}),
  }),
);

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
const client = testClient<AppType>(createApp({ fileStorageAdapter }));

afterEach(async () => {
  vi.clearAllMocks();
  await cleanupPublicApiFixture();
});

/**
 * An API key whose owner has a Chinese project with a Word file approved in English, and an
 * English project to send it to. The file is stored with the default adapter, which is where
 * the download builder reads from.
 */
async function chainedProjectsFixture(options: { approved?: boolean } = {}) {
  const { apiKey, project } = await createPublicApiFixture();
  const organizationId = project.organizationId;
  const userId = project.createdByUserId as string;
  const team = await ensureDefaultWorkspaceTeam(organizationId);
  const insertProject = async (values: {
    name: string;
    sourceLocale: string;
    targetLocales: string[];
    teamId?: string;
  }) => {
    const [inserted] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        identifier: uniqueTestProjectIdentifier(),
        organizationId,
        teamId: team.id,
        createdByUserId: userId,
        description: "",
        translationContext: "",
        ...values,
      })
      .returning();
    return inserted;
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

  const content = await ooxmlFixture("docx-basic");
  const entries = await readDocxEntries(content);
  if (!entries.ok) {
    throw new Error(`could not read fixture entries: ${entries.error.code}`);
  }
  const sourceFile = await ensureRepositorySourceFile({
    organizationId,
    projectId: original.id,
    sourcePath: SOURCE_PATH,
  });
  const storedFile = await createStoredFile({
    organizationId,
    projectId: original.id,
    createdByUserId: userId,
    role: "source",
    sourceKind: "repository_file",
    filename: "report.docx",
    contentType: DOCX_CONTENT_TYPE,
    content: Buffer.from(content),
  });
  const version = await createRepositorySourceFileVersion({
    storedFile,
    sourcePath: SOURCE_PATH,
  });
  await db
    .update(schema.repositorySourceFileVersions)
    .set({ ingestState: "ingested" })
    .where(eq(schema.repositorySourceFileVersions.id, version.id));

  await upsertProjectTranslationKeysFromEntries({
    organizationId,
    projectId: original.id,
    repositorySourceFileId: sourceFile.id,
    entries: entries.value.map((entry) => ({ ...entry, context: entry.context ?? null })),
  });
  const keys = await db
    .select({ id: schema.projectTranslationKeys.id, key: schema.projectTranslationKeys.key })
    .from(schema.projectTranslationKeys)
    .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id));
  // All but the first string when not fully approved.
  const approvedKeys = options.approved === false ? keys.slice(1) : keys;
  await db.insert(schema.projectTranslations).values(
    approvedKeys.map((key) => ({
      organizationId,
      projectId: original.id,
      translationKeyId: key.id,
      targetLocale: PIVOT_LOCALE,
      text: `English for ${key.key}`,
      status: "approved" as const,
      provenance: "import" as const,
    })),
  );

  const [storedKey] = await db
    .select({ id: schema.organizationApiKeys.id })
    .from(schema.organizationApiKeys)
    .where(eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey)));

  return {
    apiKey,
    apiKeyId: storedKey.id,
    organizationId,
    userId,
    team,
    original,
    destination,
    version,
    keys,
    insertProject,
    send: (
      json: { sourcePath?: string; destinationProjectId?: string; replaceVersionId?: string } = {},
      sendOptions: { projectId?: string } = {},
    ) =>
      client.api.v1.projects[":projectId"].files["translation-source"].$post(
        {
          param: { projectId: sendOptions.projectId ?? original.id },
          json: {
            sourcePath: json.sourcePath ?? SOURCE_PATH,
            destinationProjectId: json.destinationProjectId ?? destination.id,
            replaceVersionId: json.replaceVersionId,
          },
        },
        { headers: { "x-api-key": apiKey } },
      ),
    setRole: (role: OrganizationMembershipRole) =>
      db
        .update(schema.organizationMemberships)
        .set({ role })
        .where(
          and(
            eq(schema.organizationMemberships.organizationId, organizationId),
            eq(schema.organizationMemberships.userId, userId),
          ),
        ),
    setPermissions: (permissions: string[]) =>
      db
        .update(schema.organizationApiKeys)
        .set({ permissions })
        .where(eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey))),
    destinationVersions: () =>
      db
        .select()
        .from(schema.repositorySourceFileVersions)
        .where(eq(schema.repositorySourceFileVersions.projectId, destination.id))
        .orderBy(desc(schema.repositorySourceFileVersions.createdAt)),
  };
}

type ChainedProjects = Awaited<ReturnType<typeof chainedProjectsFixture>>;

/** A file put in the destination at the fixture file's path, not by a send from this file. */
async function addToDestination(
  fixture: ChainedProjects,
  options: {
    uploadedByUserId?: string;
    uploadedByApiKeyId?: string;
    uploadSurface?: string;
    metadata?: Record<string, unknown>;
    branchName?: string;
  } = {},
) {
  const storedFile = await createStoredFile({
    organizationId: fixture.organizationId,
    projectId: fixture.destination.id,
    role: "source",
    sourceKind: "repository_file",
    filename: "report.docx",
    contentType: DOCX_CONTENT_TYPE,
    content: Buffer.from("uploaded by hand"),
    metadata: options.metadata,
  });
  return createRepositorySourceFileVersion({
    storedFile,
    sourcePath: SOURCE_PATH,
    branchName: options.branchName,
    uploadSurface: options.uploadSurface ?? "files_page",
    uploadedByUserId: options.uploadedByUserId ?? null,
    uploadedByApiKeyId: options.uploadedByApiKeyId ?? null,
  });
}

/** Makes the key's owner a developer in the projects' team only. */
async function developerInTeam(fixture: ChainedProjects) {
  await fixture.setRole("developer");
  await db
    .insert(schema.teamMemberships)
    .values({ teamId: fixture.team.id, userId: fixture.userId });
}

async function otherTeam(fixture: ChainedProjects) {
  const [team] = await db
    .insert(schema.teams)
    .values({
      organizationId: fixture.organizationId,
      name: "Other team",
      slug: `other-team-${randomUUID()}`,
    })
    .returning();
  return team;
}

type Refusal = {
  error: string;
  message: string;
  details: { destinationFile: Record<string, unknown> };
};

describe("public translation source route", () => {
  it("sends a fully approved Word file to the other project under the same path", async () => {
    const fixture = await chainedProjectsFixture();

    const response = await fixture.send();

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      file: { destinationProjectId: string; sourcePath: string; stringCount: number };
    };
    expect(body.file).toMatchObject({
      destinationProjectId: fixture.destination.id,
      sourcePath: SOURCE_PATH,
      stringCount: fixture.keys.length,
    });
    const [sent] = await fixture.destinationVersions();
    expect(sent).toMatchObject({
      sourcePath: SOURCE_PATH,
      uploadSurface: TRANSLATION_AS_SOURCE_UPLOAD_SURFACE,
      uploadedByUserId: fixture.userId,
    });
  });

  it("sends again over its own earlier send without being told to", async () => {
    const fixture = await chainedProjectsFixture();
    expect((await fixture.send()).status).toBe(201);

    const again = await fixture.send();

    expect(again.status).toBe(201);
    expect(await fixture.destinationVersions()).toHaveLength(2);
  });

  it("sends to the other project's default branch, whatever its other branches have", async () => {
    const fixture = await chainedProjectsFixture();
    const onBranch = await addToDestination(fixture, { branchName: "release" });

    const response = await fixture.send();

    expect(response.status).toBe(201);
    const [sent] = await fixture.destinationVersions();
    expect(sent.id).not.toBe(onBranch.id);
    const [sentFile] = await db
      .select({ branchName: schema.repositorySourceFiles.branchName })
      .from(schema.repositorySourceFiles)
      .where(eq(schema.repositorySourceFiles.id, sent.repositorySourceFileId));
    expect(sentFile.branchName).toBe("main");
  });

  it("refuses when the other project's default branch is protected", async () => {
    const fixture = await chainedProjectsFixture();
    const branch = await projectBranchService.ensureDefaultBranch({
      organizationId: fixture.organizationId,
      projectId: fixture.destination.id,
    });
    await db
      .update(schema.projectBranches)
      .set({ isProtected: true })
      .where(eq(schema.projectBranches.id, branch.id));

    const response = await fixture.send();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "destination_branch_protected",
    });
    expect(await fixture.destinationVersions()).toHaveLength(0);
  });

  it("refuses while a string has no approved translation, with how many are missing", async () => {
    const fixture = await chainedProjectsFixture({ approved: false });

    const response = await fixture.send();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "translations_not_approved",
      details: { missingCount: 1, totalCount: fixture.keys.length },
    });
    expect(await fixture.destinationVersions()).toHaveLength(0);
  });

  it("refuses to replace a file it did not send, then replaces the version it was shown", async () => {
    const fixture = await chainedProjectsFixture();
    const byHand = await addToDestination(fixture, { uploadedByUserId: fixture.userId });

    const refused = await fixture.send();

    expect(refused.status).toBe(409);
    const refusal = (await refused.json()) as Refusal;
    expect(refusal.error).toBe("destination_file_replaced");
    expect(refusal.details.destinationFile).toMatchObject({
      path: SOURCE_PATH,
      versionId: byHand.id,
      addedBy: expect.stringContaining("@example.com"),
      addedThroughApi: false,
      fromRepositorySync: false,
      sentFrom: null,
    });
    expect(await fixture.destinationVersions()).toHaveLength(1);

    const replaced = await fixture.send({
      replaceVersionId: refusal.details.destinationFile.versionId as string,
    });

    expect(replaced.status).toBe(201);
    const [newest] = await fixture.destinationVersions();
    expect(newest.uploadSurface).toBe(TRANSLATION_AS_SOURCE_UPLOAD_SURFACE);
  });

  it("names the owner of the API key that uploaded the file there, not the key", async () => {
    const fixture = await chainedProjectsFixture();
    await addToDestination(fixture, { uploadedByApiKeyId: fixture.apiKeyId });

    const refused = await fixture.send();

    expect(refused.status).toBe(409);
    const refusal = (await refused.json()) as Refusal;
    expect(refusal.details.destinationFile).toMatchObject({
      addedBy: expect.stringContaining("@example.com"),
      addedThroughApi: true,
    });
    expect(JSON.stringify(refusal)).not.toContain("Public API Test Key");
  });

  it("asks before replacing a file the other project's repository sync added", async () => {
    const fixture = await chainedProjectsFixture();
    const synced = await addToDestination(fixture, { uploadSurface: "gitlab_content_sync" });

    const refused = await fixture.send();

    expect(refused.status).toBe(409);
    const refusal = (await refused.json()) as Refusal;
    expect(refusal.details.destinationFile).toMatchObject({
      versionId: synced.id,
      fromRepositorySync: true,
    });
    expect((await fixture.send({ replaceVersionId: synced.id })).status).toBe(201);
  });

  it("does not name a project the key's owner cannot open that sent the file there", async () => {
    const fixture = await chainedProjectsFixture();
    await developerInTeam(fixture);
    const hidden = await fixture.insertProject({
      name: "Hidden requests",
      sourceLocale: "zh-CN",
      targetLocales: [PIVOT_LOCALE],
      teamId: (await otherTeam(fixture)).id,
    });
    const hiddenFile = await createStoredFile({
      organizationId: fixture.organizationId,
      projectId: hidden.id,
      role: "source",
      sourceKind: "repository_file",
      filename: "report.docx",
      contentType: DOCX_CONTENT_TYPE,
      content: Buffer.from("hidden original"),
    });
    const hiddenVersion = await createRepositorySourceFileVersion({
      storedFile: hiddenFile,
      sourcePath: "hidden/report.docx",
    });
    await addToDestination(fixture, {
      uploadSurface: TRANSLATION_AS_SOURCE_UPLOAD_SURFACE,
      metadata: { translationSource: { sourceFileVersionId: hiddenVersion.id } },
    });

    const refused = await fixture.send();

    expect(refused.status).toBe(409);
    const refusal = (await refused.json()) as Refusal;
    expect(refusal.details.destinationFile.sentFrom).toEqual({
      projectId: null,
      projectName: null,
      sourcePath: "hidden/report.docx",
    });
  });

  it("names a project the key's owner can open that sent the file there", async () => {
    const fixture = await chainedProjectsFixture();
    await developerInTeam(fixture);
    const sender = await fixture.insertProject({
      name: "Other requests",
      sourceLocale: "zh-CN",
      targetLocales: [PIVOT_LOCALE],
    });
    const senderFile = await createStoredFile({
      organizationId: fixture.organizationId,
      projectId: sender.id,
      role: "source",
      sourceKind: "repository_file",
      filename: "report.docx",
      contentType: DOCX_CONTENT_TYPE,
      content: Buffer.from("other original"),
    });
    const senderVersion = await createRepositorySourceFileVersion({
      storedFile: senderFile,
      sourcePath: "other/report.docx",
    });
    await addToDestination(fixture, {
      uploadSurface: TRANSLATION_AS_SOURCE_UPLOAD_SURFACE,
      metadata: { translationSource: { sourceFileVersionId: senderVersion.id } },
    });

    const refused = await fixture.send();

    expect(refused.status).toBe(409);
    const refusal = (await refused.json()) as Refusal;
    expect(refusal.details.destinationFile.sentFrom).toEqual({
      projectId: sender.id,
      projectName: "Other requests",
      sourcePath: "other/report.docx",
    });
  });

  it("does not replace a file that arrived after the version named", async () => {
    const fixture = await chainedProjectsFixture();
    const seen = await addToDestination(fixture, { uploadedByUserId: fixture.userId });
    const newer = await addToDestination(fixture, { uploadedByUserId: fixture.userId });

    const response = await fixture.send({ replaceVersionId: seen.id });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "destination_file_replaced",
      details: { destinationFile: { versionId: newer.id } },
    });
  });

  it("refuses a file whose newest version is still being read", async () => {
    const fixture = await chainedProjectsFixture();
    await db
      .update(schema.repositorySourceFileVersions)
      .set({ ingestState: "pending" })
      .where(eq(schema.repositorySourceFileVersions.id, fixture.version.id));

    const response = await fixture.send();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "source_file_not_ready" });
  });

  it("refuses a file whose newest upload could not be read", async () => {
    const fixture = await chainedProjectsFixture();
    await db
      .update(schema.repositorySourceFileVersions)
      .set({ ingestState: "failed" })
      .where(eq(schema.repositorySourceFileVersions.id, fixture.version.id));

    const response = await fixture.send();

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: "source_file_read_failed" });
  });

  it("refuses requests that name the wrong file or project", async () => {
    const fixture = await chainedProjectsFixture();
    const french = await fixture.insertProject({
      name: "Website",
      sourceLocale: "fr-FR",
      targetLocales: ["de-DE"],
    });

    const cases = [
      [await fixture.send({ sourcePath: "requests/missing.docx" }), 404, "source_file_not_found"],
      [await fixture.send({ sourcePath: "locales/en.json" }), 400, "unsupported_file_format"],
      [await fixture.send({ destinationProjectId: french.id }), 400, "locale_not_a_target"],
      [await fixture.send({ destinationProjectId: fixture.original.id }), 400, "same_project"],
      [
        await fixture.send({ destinationProjectId: "project_missing" }),
        404,
        "destination_project_not_found",
      ],
      [await fixture.send({}, { projectId: "project_missing" }), 404, "project_not_found"],
      [
        await fixture.send({ replaceVersionId: "not-a-version" }),
        400,
        "invalid_translation_as_source_payload",
      ],
    ] as const;
    for (const [response, status, error] of cases) {
      expect({ status: response.status, body: await response.json() }).toMatchObject({
        status,
        body: { error },
      });
    }
  });

  it("needs the files:write permission", async () => {
    const fixture = await chainedProjectsFixture();
    await fixture.setPermissions(["jobs:read", "jobs:write", "files:read"]);

    const response = await fixture.send();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "forbidden" });
  });

  it("is refused for roles that cannot manage projects", async () => {
    const fixture = await chainedProjectsFixture();
    // A translator's key may hold files:write, which lets it upload, but not manage projects.
    await fixture.setRole("translator");

    const response = await fixture.send();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "forbidden",
      message: "Missing required role permission: projects:write",
    });
    expect(await fixture.destinationVersions()).toHaveLength(0);
  });

  it("does not find a project outside the key owner's teams", async () => {
    const fixture = await chainedProjectsFixture();
    await developerInTeam(fixture);
    await db
      .update(schema.projects)
      .set({ teamId: (await otherTeam(fixture)).id })
      .where(eq(schema.projects.id, fixture.destination.id));

    const response = await fixture.send();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "destination_project_not_found",
    });
  });

  it("lets a developer send between projects of their team", async () => {
    const fixture = await chainedProjectsFixture();
    await developerInTeam(fixture);

    const response = await fixture.send();

    expect(response.status).toBe(201);
  });
});
