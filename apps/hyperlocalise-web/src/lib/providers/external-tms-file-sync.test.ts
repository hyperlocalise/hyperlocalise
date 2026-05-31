import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import { createProjectTestFixture } from "../../api/routes/project/project.fixture";
import {
  syncExternalTmsFileKeys,
  type ExternalTmsFileKeyFetcher,
} from "./sync/external-tms-file-sync";
import { upsertOrganizationExternalTmsProviderCredential } from "./organization-external-tms-provider-credentials";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

async function createExternalTmsProject(input?: { providerKind?: "phrase" | "crowdin" }) {
  const { organization, user, project } = await projectFixture.createStoredProjectFixture();
  const providerKind = input?.providerKind ?? "phrase";
  const credential = await upsertOrganizationExternalTmsProviderCredential({
    organizationId: organization.id,
    userId: user.id,
    role: "admin",
    providerKind,
    displayName: providerKind,
    secretMaterial: "secret-token",
    baseUrl: "https://api.example.test",
  });

  const [externalProject] = await db
    .update(schema.projects)
    .set({
      source: "external_tms",
      externalProviderCredentialId: credential.id,
      externalProviderKind: providerKind,
      externalProjectId: `${providerKind}-project-1`,
      targetLocales: ["fr-FR", "de-DE"],
    })
    .where(eq(schema.projects.id, project.id))
    .returning();

  return { organization, user, credential, project: externalProject };
}

describe("syncExternalTmsFileKeys", () => {
  it("fetches provider files/keys and upserts normalized external_tms_files", async () => {
    const { organization, credential, project } = await createExternalTmsProject({
      providerKind: "crowdin",
    });
    const fetchFileKeys: ExternalTmsFileKeyFetcher = async ({
      credential: fetchedCredential,
      externalProjectId,
      secretMaterial,
    }) => {
      expect(fetchedCredential.id).toBe(credential.id);
      expect(externalProjectId).toBe("crowdin-project-1");
      expect(secretMaterial).toBe("secret-token");

      return [
        {
          externalResourceId: "file-1",
          resourceType: "file" as const,
          sourcePath: "main/locales/en.json",
          displayName: "en.json",
          format: "json",
          sourceLocale: "en",
          targetLocales: ["fr"],
          revision: "5",
          providerPayload: { id: "file-1" },
        },
        {
          externalResourceId: "key-1",
          resourceType: "key" as const,
          sourcePath: "main/locales/en.json/keys/hello",
          displayName: "hello",
          providerPayload: { id: "key-1" },
        },
      ];
    };

    const result = await syncExternalTmsFileKeys({
      organizationId: organization.id,
      projectId: project.id,
      providerKind: "crowdin",
      fetchFileKeys,
    });

    expect(result.status).toBe("succeeded");
    expect(result.counts).toEqual({
      filesDiscovered: 2,
      filesSynced: 2,
      filesFailed: 0,
    });

    const files = await db
      .select()
      .from(schema.externalTmsFiles)
      .where(eq(schema.externalTmsFiles.projectId, project.id));

    expect(files).toHaveLength(2);
    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceType: "file",
          externalResourceId: "file-1",
          sourcePath: "main/locales/en.json",
          displayName: "en.json",
          format: "json",
        }),
        expect.objectContaining({
          resourceType: "key",
          externalResourceId: "key-1",
          sourcePath: "main/locales/en.json/keys/hello",
          displayName: "hello",
        }),
      ]),
    );
  });

  it("updates existing file records without creating duplicates", async () => {
    const { organization, project } = await createExternalTmsProject({ providerKind: "crowdin" });

    await syncExternalTmsFileKeys({
      organizationId: organization.id,
      projectId: project.id,
      providerKind: "crowdin",
      fetchFileKeys: async () => [
        {
          externalResourceId: "file-1",
          resourceType: "file",
          sourcePath: "docs/intro.md",
          displayName: "intro.md",
          revision: "1",
        },
      ],
    });

    const second = await syncExternalTmsFileKeys({
      organizationId: organization.id,
      projectId: project.id,
      providerKind: "crowdin",
      fetchFileKeys: async () => [
        {
          externalResourceId: "file-1",
          resourceType: "file",
          sourcePath: "docs/intro.md",
          displayName: "intro.md",
          revision: "2",
        },
      ],
    });

    expect(second.counts).toEqual({
      filesDiscovered: 1,
      filesSynced: 1,
      filesFailed: 0,
    });

    const files = await db
      .select()
      .from(schema.externalTmsFiles)
      .where(eq(schema.externalTmsFiles.projectId, project.id));

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      externalResourceId: "file-1",
      revision: "2",
    });
  });

  it("records failed provider resources without upserting them", async () => {
    const { organization, project } = await createExternalTmsProject({ providerKind: "crowdin" });

    const result = await syncExternalTmsFileKeys({
      organizationId: organization.id,
      projectId: project.id,
      providerKind: "crowdin",
      fetchFileKeys: async () => [
        {
          externalResourceId: "file-1",
          resourceType: "file",
          sourcePath: "docs/intro.md",
          displayName: "intro.md",
        },
        {
          externalResourceId: "file-1",
          resourceType: "key",
          sourcePath: "docs/intro.md/keys",
          displayName: "intro.md keys",
          syncErrorMessage: "Failed to list source strings for docs/intro.md: rate limited",
        },
      ],
    });

    expect(result.status).toBe("failed");
    expect(result.counts).toEqual({
      filesDiscovered: 2,
      filesSynced: 1,
      filesFailed: 1,
    });
    expect(result.failures).toEqual([
      {
        externalResourceId: "file-1",
        sourcePath: "docs/intro.md/keys",
        message: "Failed to list source strings for docs/intro.md: rate limited",
      },
    ]);

    const files = await db
      .select()
      .from(schema.externalTmsFiles)
      .where(eq(schema.externalTmsFiles.projectId, project.id));

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      resourceType: "file",
      externalResourceId: "file-1",
    });
  });

  it("records a failed run when provider file fetching fails", async () => {
    const { organization, project } = await createExternalTmsProject();

    await expect(
      syncExternalTmsFileKeys({
        organizationId: organization.id,
        projectId: project.id,
        providerKind: "phrase",
        fetchFileKeys: async () => {
          throw new Error("Phrase returned HTTP 429 while listing files");
        },
      }),
    ).rejects.toThrow("Phrase returned HTTP 429 while listing files");

    const [run] = await db
      .select()
      .from(schema.providerSyncRuns)
      .where(eq(schema.providerSyncRuns.organizationId, organization.id));

    expect(run?.kind).toBe("file_key_scan");
    expect(run?.status).toBe("failed");
    expect(run?.errorMessage).toBe("Phrase returned HTTP 429 while listing files");
  });
});
