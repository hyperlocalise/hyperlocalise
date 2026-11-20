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

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { createMemoryFileStorageAdapter } from "@/lib/file-storage/memory";

import { getSampleWorkspaceStatus, seedSampleWorkspace } from "./sample-workspace-service";

const { claimSourceFileIngestMock } = vi.hoisted(() => ({
  claimSourceFileIngestMock: vi.fn(),
}));

vi.mock("@/lib/projects/files/source-file-ingest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/projects/files/source-file-ingest")>();
  return { ...actual, claimSourceFileIngest: claimSourceFileIngestMock };
});

const authFixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await authFixture.cleanup();
});

describe("seedSampleWorkspace", () => {
  it("removes partial sample data when source-file ingest cannot be claimed", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    claimSourceFileIngestMock.mockResolvedValue(null);

    await expect(
      seedSampleWorkspace({
        organizationId: organization.id,
        userId: user.id,
        fileStorageAdapter: createMemoryFileStorageAdapter(),
      }),
    ).rejects.toThrow("sample source file ingest claim failed");

    const status = await getSampleWorkspaceStatus(organization.id);
    expect(status).toEqual({ loaded: false, projects: [] });

    const leftover = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.organizationId, organization.id));
    expect(leftover).toHaveLength(0);
    const glossaries = await db
      .select({ id: schema.glossaries.id })
      .from(schema.glossaries)
      .where(eq(schema.glossaries.organizationId, organization.id));
    expect(glossaries).toHaveLength(0);
  });
});
