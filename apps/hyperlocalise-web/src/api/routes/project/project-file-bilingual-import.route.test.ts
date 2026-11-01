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

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { testClient } from "hono/testing";

import { createProjectTestFixture } from "./project.fixture";

const { parseFilteredMock, importCatBilingualRowsMock, resolveApiAuthContextFromSessionMock } =
  vi.hoisted(() => ({
    parseFilteredMock: vi.fn(),
    importCatBilingualRowsMock: vi.fn(),
    resolveApiAuthContextFromSessionMock: vi.fn(
      (options) =>
        globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
        globalThis.__testApiAuthContext ??
        null,
    ),
  }));

vi.mock("@/lib/go-svc/go-svc-server-client", () => ({
  createGoSvcServerClient: () => ({
    editorExport: { parseFiltered: parseFilteredMock },
  }),
}));

vi.mock("@/lib/projects/content-editor/content-editor-bilingual-import-apply", () => ({
  importCatBilingualRows: (...args: unknown[]) => importCatBilingualRowsMock(...args),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

const app = createApp();
const client = testClient<AppType>(app);
const projectFixture = createProjectTestFixture(client);

async function createNativeProject(targetLocales: string[]) {
  const admin = projectFixture.createWorkosIdentityWithRole("admin");
  const headers = await projectFixture.authHeadersFor(admin);
  const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
  const userId = globalThis.__testApiAuthContext!.user.localUserId;
  const projectId = `project_${randomUUID()}`;

  await db.insert(schema.projects).values({
    id: projectId,
    identifier: uniqueTestProjectIdentifier(),
    organizationId,
    teamId: null,
    createdByUserId: userId,
    name: "Native Project",
    description: "",
    translationContext: "",
    source: "native",
    sourceLocale: "en",
    targetLocales,
  });

  return { admin, headers, organizationId, projectId };
}

async function postBilingualImport(input: {
  slug: string;
  projectId: string;
  sourcePath: string;
  locale: string;
  file: File;
  headers: Record<string, string>;
}) {
  const form = new FormData();
  form.set("sourcePath", input.sourcePath);
  form.set("locale", input.locale);
  form.set("file", input.file);
  return app.request(
    `/api/orgs/${encodeURIComponent(input.slug)}/projects/${encodeURIComponent(input.projectId)}/files/bilingual/import`,
    { method: "POST", body: form, headers: input.headers },
  );
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
});

describe("project file bilingual import route", () => {
  it("parses a bilingual export and imports matching strings", async () => {
    const { admin, headers, organizationId, projectId } = await createNativeProject(["fr"]);
    await db.insert(schema.repositorySourceFiles).values({
      organizationId,
      projectId,
      sourcePath: "locales/en.json",
    });
    parseFilteredMock.mockResolvedValue({
      rows: [
        {
          key: "greeting",
          sourceText: "Hello",
          targetText: "Bonjour",
          sourceLocale: "en",
          targetLocale: "fr",
          sourcePath: "locales/en.json",
        },
      ],
    });
    importCatBilingualRowsMock.mockResolvedValue({
      matched: 1,
      imported: 1,
      skipped: 0,
      files: 1,
    });

    const response = await postBilingualImport({
      slug: admin.organization.slug ?? "missing-slug",
      projectId,
      sourcePath: "locales/en.json",
      locale: "fr",
      file: new File(["<xliff/>"], "queue-fr.xliff", { type: "application/xliff+xml" }),
      headers,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      import: { matched: 1, imported: 1, skipped: 0, files: 1 },
    });
    expect(parseFilteredMock).toHaveBeenCalledWith(
      expect.objectContaining({ format: "xliff", filename: "queue-fr.xliff" }),
    );
    expect(importCatBilingualRowsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        sourcePath: "locales/en.json",
        targetLocale: "fr",
      }),
    );
  });

  it("rejects an unsupported bilingual format", async () => {
    const { admin, headers, organizationId, projectId } = await createNativeProject(["fr"]);
    await db.insert(schema.repositorySourceFiles).values({
      organizationId,
      projectId,
      sourcePath: "locales/en.json",
    });

    const response = await postBilingualImport({
      slug: admin.organization.slug ?? "missing-slug",
      projectId,
      sourcePath: "locales/en.json",
      locale: "fr",
      file: new File(["nope"], "notes.txt", { type: "text/plain" }),
      headers,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "unsupported_bilingual_format",
    });
    expect(parseFilteredMock).not.toHaveBeenCalled();
  });

  it("rejects an empty bilingual file", async () => {
    const { admin, headers, organizationId, projectId } = await createNativeProject(["fr"]);
    await db.insert(schema.repositorySourceFiles).values({
      organizationId,
      projectId,
      sourcePath: "locales/en.json",
    });
    parseFilteredMock.mockResolvedValue({ rows: [] });

    const response = await postBilingualImport({
      slug: admin.organization.slug ?? "missing-slug",
      projectId,
      sourcePath: "locales/en.json",
      locale: "fr",
      file: new File(["key,source_locale\n"], "queue-fr.csv", { type: "text/csv" }),
      headers,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "empty_bilingual_file" });
    expect(importCatBilingualRowsMock).not.toHaveBeenCalled();
  });

  it("rejects bilingual import without write-back permission", async () => {
    const { admin, projectId } = await createNativeProject(["fr"]);
    const member = projectFixture.createWorkosIdentityForOrganization(admin.organization, "member");
    const headers = await projectFixture.authHeadersFor(member);

    const response = await postBilingualImport({
      slug: admin.organization.slug ?? "missing-slug",
      projectId,
      sourcePath: "locales/en.json",
      locale: "fr",
      file: new File(["<xliff/>"], "queue-fr.xliff", { type: "application/xliff+xml" }),
      headers,
    });

    expect(response.status).toBe(403);
    expect(parseFilteredMock).not.toHaveBeenCalled();
  });
});
