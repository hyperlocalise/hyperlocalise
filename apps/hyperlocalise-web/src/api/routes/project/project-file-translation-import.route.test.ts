import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import type { TranslationFileImportEventData } from "@/lib/workflow/types";

import { createProjectTestFixture } from "./project.fixture";
import { createMemoryFileStorageAdapter } from "../public-files/public-files.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

const enqueuedImports: TranslationFileImportEventData[] = [];
const translationFileImportQueue = {
  async enqueue(event: TranslationFileImportEventData) {
    enqueuedImports.push(event);
    return { ids: [`run_${enqueuedImports.length}`] };
  },
};
const fileStorageAdapter = createMemoryFileStorageAdapter();
const app = createApp({ fileStorageAdapter, translationFileImportQueue });
const client = testClient(app);
const projectFixture = createProjectTestFixture(client);

async function createNativeProject(targetLocales: string[]) {
  const admin = projectFixture.createWorkosIdentityWithRole("admin");
  const headers = await projectFixture.authHeadersFor(admin);
  const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
  const userId = globalThis.__testApiAuthContext!.user.localUserId;
  const projectId = `project_${randomUUID()}`;

  await db.insert(schema.projects).values({
    id: projectId,
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

async function postImport(input: {
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
    `/api/orgs/${encodeURIComponent(input.slug)}/projects/${encodeURIComponent(input.projectId)}/files/translations/import`,
    { method: "POST", body: form, headers: input.headers },
  );
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  enqueuedImports.length = 0;
  await projectFixture.cleanup();
});

describe("project file translation import route", () => {
  it("stores the file and enqueues an import for a native source file", async () => {
    const { admin, headers, organizationId, projectId } = await createNativeProject(["fr", "de"]);
    await db.insert(schema.repositorySourceFiles).values({
      organizationId,
      projectId,
      sourcePath: "locales/en.json",
    });

    const response = await postImport({
      slug: admin.organization.slug ?? "missing-slug",
      projectId,
      sourcePath: "locales/en.json",
      locale: "fr",
      file: new File(['{"greeting":"Bonjour"}'], "en.json", { type: "application/json" }),
      headers,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      import: { status: "queued", sourcePath: "locales/en.json", locale: "fr" },
    });

    expect(enqueuedImports).toHaveLength(1);
    expect(enqueuedImports[0]).toMatchObject({
      organizationId,
      projectId,
      sourcePath: "locales/en.json",
      targetLocale: "fr",
    });

    const storedFiles = await db
      .select({ role: schema.storedFiles.role })
      .from(schema.storedFiles)
      .where(eq(schema.storedFiles.projectId, projectId));
    expect(storedFiles).toHaveLength(1);
    expect(storedFiles[0]?.role).toBe("reference");
  });

  it("rejects an unsupported translation file format", async () => {
    const { admin, headers, organizationId, projectId } = await createNativeProject(["fr"]);
    await db.insert(schema.repositorySourceFiles).values({
      organizationId,
      projectId,
      sourcePath: "Dockerfile",
    });

    const response = await postImport({
      slug: admin.organization.slug ?? "missing-slug",
      projectId,
      sourcePath: "Dockerfile",
      locale: "fr",
      file: new File(["FROM node"], "Dockerfile", { type: "text/plain" }),
      headers,
    });

    expect(response.status).toBe(400);
    expect(enqueuedImports).toHaveLength(0);
  });

  it("returns not found when the source file does not exist", async () => {
    const { admin, headers, projectId } = await createNativeProject(["fr"]);

    const response = await postImport({
      slug: admin.organization.slug ?? "missing-slug",
      projectId,
      sourcePath: "locales/en.json",
      locale: "fr",
      file: new File(['{"greeting":"Bonjour"}'], "en.json", { type: "application/json" }),
      headers,
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "source_file_not_found" });
    expect(enqueuedImports).toHaveLength(0);
  });

  it("rejects a locale that is not a project target locale", async () => {
    const { admin, headers, organizationId, projectId } = await createNativeProject(["fr"]);
    await db.insert(schema.repositorySourceFiles).values({
      organizationId,
      projectId,
      sourcePath: "locales/en.json",
    });

    const response = await postImport({
      slug: admin.organization.slug ?? "missing-slug",
      projectId,
      sourcePath: "locales/en.json",
      locale: "es",
      file: new File(['{"greeting":"Hola"}'], "en.json", { type: "application/json" }),
      headers,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_target_locale" });
    expect(enqueuedImports).toHaveLength(0);
  });
});
