import "dotenv/config";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import {
  listExternalTmsFilesForProject,
  upsertExternalTmsFile,
} from "./organization-external-tms-files";

describe("organizationExternalTmsFiles", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await db.delete(schema.externalTmsFiles);
    await db.delete(schema.projects);
    await db.delete(schema.organizations);
  });

  async function createProject() {
    const organizationId = randomUUID();
    const projectId = `project_${randomUUID()}`;

    await db.insert(schema.organizations).values({
      id: organizationId,
      workosOrganizationId: `org_${randomUUID()}`,
      slug: `org-${randomUUID().slice(0, 8)}`,
      name: "Acme",
    });
    await db.insert(schema.projects).values({
      id: projectId,
      organizationId,
      name: "Marketing Website",
      source: "external_tms",
      externalProviderKind: "phrase",
      externalProjectId: "phrase-project-1",
    });

    return { organizationId, projectId };
  }

  it("upserts provider file records without duplication", async () => {
    const { organizationId, projectId } = await createProject();

    const created = await upsertExternalTmsFile({
      organizationId,
      projectId,
      providerKind: "phrase",
      externalProjectId: "phrase-project-1",
      resourceType: "file",
      externalResourceId: "file-1",
      sourcePath: "./locales//en.json",
      displayName: "en.json",
      format: "json",
      sourceLocale: "en",
      targetLocales: ["fr"],
      sourceHash: "sha256:one",
      providerPayload: { id: "file-1", revision: 1 },
    });

    expect(created.syncState).toBe("pending");

    const updated = await upsertExternalTmsFile({
      organizationId,
      projectId,
      providerKind: "phrase",
      externalProjectId: "phrase-project-1",
      resourceType: "file",
      externalResourceId: "file-1",
      sourcePath: "locales/en.json",
      displayName: "English source",
      format: "json",
      sourceLocale: "en-US",
      targetLocales: ["fr", "de"],
      sourceHash: "sha256:two",
      revision: "2",
      syncState: "stale",
      localeReadiness: { fr: "ready", de: "missing" },
      providerPayload: { id: "file-1", revision: 2 },
    });

    expect(updated.id).toBe(created.id);
    expect(updated.displayName).toBe("English source");
    expect(updated.sourcePath).toBe("locales/en.json");
    expect(updated.targetLocales).toEqual(["fr", "de"]);
    expect(updated.sourceHash).toBe("sha256:two");
    expect(updated.syncState).toBe("stale");

    const reset = await upsertExternalTmsFile({
      organizationId,
      projectId,
      providerKind: "phrase",
      externalProjectId: "phrase-project-1",
      resourceType: "file",
      externalResourceId: "file-1",
      sourcePath: "locales/en.json",
      displayName: "English source",
      format: "json",
      sourceLocale: "en-US",
      targetLocales: ["fr", "de"],
      sourceHash: "sha256:three",
      revision: "3",
      providerPayload: { id: "file-1", revision: 3 },
    });

    expect(reset.id).toBe(created.id);
    expect(reset.syncState).toBe("pending");

    const rows = await db
      .select()
      .from(schema.externalTmsFiles)
      .where(
        and(
          eq(schema.externalTmsFiles.organizationId, organizationId),
          eq(schema.externalTmsFiles.providerKind, "phrase"),
          eq(schema.externalTmsFiles.externalProjectId, "phrase-project-1"),
          eq(schema.externalTmsFiles.resourceType, "file"),
          eq(schema.externalTmsFiles.externalResourceId, "file-1"),
        ),
      );

    expect(rows).toHaveLength(1);
  });

  it("stores key records alongside file records for unified project browsing", async () => {
    const { organizationId, projectId } = await createProject();

    await upsertExternalTmsFile({
      organizationId,
      projectId,
      providerKind: "crowdin",
      externalProjectId: "crowdin-project-1",
      resourceType: "file",
      externalResourceId: "file-1",
      sourcePath: "docs/intro.md",
      targetLocales: ["ja"],
    });
    await upsertExternalTmsFile({
      organizationId,
      projectId,
      providerKind: "crowdin",
      externalProjectId: "crowdin-project-1",
      resourceType: "key",
      externalResourceId: "key-1",
      sourcePath: "keys/nav.docs",
      displayName: "nav.docs",
      targetLocales: ["ja"],
    });

    const files = await listExternalTmsFilesForProject({ organizationId, projectId });
    expect(files.map((file) => [file.resourceType, file.sourcePath])).toEqual([
      ["file", "docs/intro.md"],
      ["key", "keys/nav.docs"],
    ]);
  });

  it("limits provider file listings", async () => {
    const { organizationId, projectId } = await createProject();

    for (const sourcePath of ["keys/one", "keys/two", "keys/three"]) {
      await upsertExternalTmsFile({
        organizationId,
        projectId,
        providerKind: "crowdin",
        externalProjectId: "crowdin-project-1",
        resourceType: "key",
        externalResourceId: sourcePath,
        sourcePath,
      });
    }

    const files = await listExternalTmsFilesForProject({ organizationId, projectId, limit: 2 });

    expect(files.map((file) => file.sourcePath)).toEqual(["keys/one", "keys/three"]);
  });
});
