import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import { createProjectTestFixture } from "../../api/routes/project/project.fixture";
import {
  pullExternalTmsTaskContent,
  pushExternalTmsTranslations,
  type ExternalTmsContentPuller,
  type ExternalTmsTranslationPusher,
} from "./sync/external-tms-content-sync";
import { upsertOrganizationExternalTmsProviderCredential } from "./organization-external-tms-provider-credentials";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

async function createExternalTmsProject() {
  const { organization, user, project } = await projectFixture.createStoredProjectFixture();
  const credential = await upsertOrganizationExternalTmsProviderCredential({
    organizationId: organization.id,
    userId: user.id,
    role: "admin",
    providerKind: "crowdin",
    displayName: "crowdin",
    secretMaterial: "secret-token",
    baseUrl: "https://api.crowdin.test/api/v2",
  });

  const [externalProject] = await db
    .update(schema.projects)
    .set({
      source: "external_tms",
      externalProviderCredentialId: credential.id,
      externalProviderKind: "crowdin",
      externalProjectId: "42",
      targetLocales: ["fr"],
    })
    .where(eq(schema.projects.id, project.id))
    .returning();

  return { organization, credential, project: externalProject };
}

describe("external TMS content sync", () => {
  it("records a pull_content sync run with discovered units", async () => {
    const { organization, project } = await createExternalTmsProject();
    const pullContent: ExternalTmsContentPuller = async () => ({
      externalJobId: "2001",
      targetLocales: ["fr"],
      units: [
        {
          externalStringId: "1001",
          key: "hello",
          sourceText: "Hello",
          translations: [{ locale: "fr", text: "Bonjour", isApproved: true }],
        },
      ],
      exportArtifact: null,
    });

    const result = await pullExternalTmsTaskContent({
      organizationId: organization.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "2001",
      pullContent,
    });

    expect(result.status).toBe("succeeded");
    expect(result.counts).toEqual({
      unitsDiscovered: 1,
      translationsDiscovered: 1,
      approvedTranslations: 1,
    });

    const [syncRun] = await db
      .select()
      .from(schema.providerSyncRuns)
      .where(eq(schema.providerSyncRuns.id, result.runId));

    expect(syncRun?.kind).toBe("pull_content");
    expect(syncRun?.status).toBe("succeeded");
  });

  it("records a push_translations sync run and surfaces upload failures", async () => {
    const { organization, project } = await createExternalTmsProject();
    const pushTranslations: ExternalTmsTranslationPusher = async () => ({
      uploaded: 0,
      failed: 1,
      asyncOperations: [{ type: "crowdin_upload_translations", status: "failed" }],
      failures: [{ locale: "fr", message: "upload failed", fileId: "101" }],
    });

    const result = await pushExternalTmsTranslations({
      organizationId: organization.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "2001",
      translations: [{ locale: "fr", text: "Bonjour", fileId: "101", key: "hello" }],
      pushTranslations,
    });

    expect(result.status).toBe("failed");
    expect(result.counts.translationsFailed).toBe(1);

    const [syncRun] = await db
      .select()
      .from(schema.providerSyncRuns)
      .where(eq(schema.providerSyncRuns.id, result.runId));

    expect(syncRun?.kind).toBe("push_translations");
    expect(syncRun?.status).toBe("failed");
    expect(syncRun?.errorMessage).toContain("failed");
  });

  it("marks push_translations as failed when only the build step fails", async () => {
    const { organization, project } = await createExternalTmsProject();
    const pushTranslations: ExternalTmsTranslationPusher = async () => ({
      uploaded: 1,
      failed: 0,
      asyncOperations: [
        { type: "crowdin_upload_translations", status: "finished" },
        { type: "crowdin_translation_build", status: "failed" },
      ],
      failures: [{ locale: "fr", message: "crowdin translation build timed out", fileId: null }],
    });

    const result = await pushExternalTmsTranslations({
      organizationId: organization.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "2001",
      translations: [{ locale: "fr", text: "Bonjour", fileId: "101", key: "hello" }],
      pushTranslations,
    });

    expect(result.status).toBe("failed");

    const [syncRun] = await db
      .select()
      .from(schema.providerSyncRuns)
      .where(eq(schema.providerSyncRuns.id, result.runId));

    expect(syncRun?.status).toBe("failed");
  });
});
