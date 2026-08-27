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

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { dispatchSourceUploadMock, resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  dispatchSourceUploadMock: vi.fn(async () => ({
    outcome: "enqueued" as const,
    runId: "automation-run-1",
    inserted: true,
  })),
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

vi.mock("@/lib/agents/workspace-automation-dispatcher", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/agents/workspace-automation-dispatcher")>();
  return {
    ...actual,
    dispatchWorkspaceAutomationForSourceUpload: dispatchSourceUploadMock,
  };
});

import { createApp } from "@/api/app";
import { createMemoryFileStorageAdapter } from "@/api/routes/file/file.fixture";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { ensureRepositorySourceFileVersionForStoredFile } from "@/lib/file-storage/records";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { insertStoredSourceFile } from "../public-jobs/public-jobs.fixture";

const app = createApp({ fileStorageAdapter: createMemoryFileStorageAdapter() });
const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("workspace automation source files", () => {
  it("runs only the selected automation for existing project files", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(
        eq(schema.organizations.workosOrganizationId, identity.organization.workosOrganizationId),
      )
      .limit(1);
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.workosUserId, identity.user.workosUserId))
      .limit(1);
    if (!organization || !user) {
      throw new Error("expected local auth records");
    }
    const organizationId = organization.id;
    const projectId = `project-${crypto.randomUUID()}`;

    await db.insert(schema.projects).values({
      id: projectId,
      identifier: uniqueTestProjectIdentifier(),
      organizationId,
      createdByUserId: user.id,
      name: "Manual uploads",
    });
    const storedFile = await insertStoredSourceFile({
      organizationId,
      projectId,
      filename: "en.json",
      contentType: "application/json",
      sourceKind: "repository_file",
      metadata: { sourcePath: "locales/en.json", sourceHash: "hash-en" },
    });
    const version = await ensureRepositorySourceFileVersionForStoredFile({
      db,
      fileId: storedFile.id,
      organizationId,
      projectId,
    });
    if (!version) {
      throw new Error("expected repository source file version");
    }

    const createResponse = await app.request(`/api/orgs/${organizationSlug}/automations`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Translate selected uploads",
        instructions: "Create and translate a job for each selected file.",
        projectId,
        triggerConfig: { mode: "source_upload" },
        repositoryTarget: { kind: "none" },
        toolConfig: {
          createNativeTmsJob: {
            enabled: true,
            useProjectTargetLocales: true,
            targetLocales: [],
          },
          assignTranslateWithAgent: { enabled: true },
        },
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { automation: { id: string } };

    const runResponse = await app.request(
      `/api/orgs/${organizationSlug}/automations/${created.automation.id}/source-files`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePaths: ["locales/en.json"] }),
      },
    );

    expect(runResponse.status).toBe(202);
    await expect(runResponse.json()).resolves.toEqual({ selectedCount: 1, queuedCount: 1 });
    expect(dispatchSourceUploadMock).toHaveBeenCalledWith({
      automationId: created.automation.id,
      organizationId,
      projectId,
      sourceFileId: version.repositorySourceFileId,
      sourceFileVersionId: version.id,
      sourcePath: "locales/en.json",
      sourceHash: "hash-en",
      forceNewRun: true,
    });
  });
});
