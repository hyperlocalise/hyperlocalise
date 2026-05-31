import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import { createProjectTestFixture } from "../../api/routes/project/project.fixture";
import { upsertOrganizationExternalTmsProviderCredential } from "./organization-external-tms-provider-credentials";
import {
  listScheduledReconciliationProjects,
  runScheduledReconciliation,
  shouldIncludeCredentialForScheduledReconciliation,
  syncKindsForSchedule,
} from "./provider-scheduled-reconciliation";
import { DEFAULT_SCHEDULED_RECONCILIATION_CONFIG } from "./provider-scheduled-reconciliation-config";
import type { ProviderWebhookReconciliationEventData } from "@/lib/workflow/types";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
  vi.restoreAllMocks();
});

async function createExternalTmsProject(input?: { validationStatus?: string; isActive?: boolean }) {
  const { organization, user, project } = await projectFixture.createStoredProjectFixture();
  const credential = await upsertOrganizationExternalTmsProviderCredential({
    organizationId: organization.id,
    userId: user.id,
    role: "admin",
    providerKind: "phrase",
    displayName: "Phrase",
    secretMaterial: "secret-token",
    baseUrl: "https://api.example.test",
  });

  await db
    .update(schema.organizationExternalTmsProviderCredentials)
    .set({
      validationStatus: input?.validationStatus ?? "connected",
    })
    .where(eq(schema.organizationExternalTmsProviderCredentials.id, credential.id));

  const [externalProject] = await db
    .update(schema.projects)
    .set({
      source: "external_tms",
      externalProviderCredentialId: credential.id,
      externalProviderKind: "phrase",
      externalProjectId: "phrase-project-1",
      isActive: input?.isActive ?? true,
    })
    .where(eq(schema.projects.id, project.id))
    .returning();

  return { organization, credential, project: externalProject };
}

describe("provider scheduled reconciliation", () => {
  it("filters eligible credentials and projects", () => {
    expect(shouldIncludeCredentialForScheduledReconciliation("connected")).toBe(true);
    expect(shouldIncludeCredentialForScheduledReconciliation("degraded")).toBe(true);
    expect(shouldIncludeCredentialForScheduledReconciliation("error")).toBe(false);
    expect(shouldIncludeCredentialForScheduledReconciliation("unvalidated")).toBe(false);
  });

  it("maps schedules to distinct sync kinds", () => {
    expect(syncKindsForSchedule("incremental")).toEqual(["file_key_scan", "job_task_scan"]);
    expect(syncKindsForSchedule("resource_import")).toEqual(["tm_scan", "glossary_scan"]);
    expect(syncKindsForSchedule("full")).toEqual([
      "project_scan",
      "file_key_scan",
      "job_task_scan",
      "tm_scan",
      "glossary_scan",
    ]);
    expect(syncKindsForSchedule("audit")).toEqual([]);
  });

  it("lists only active external TMS projects with connected credentials", async () => {
    const included = await createExternalTmsProject({ validationStatus: "connected" });
    await createExternalTmsProject({ validationStatus: "error" });
    await createExternalTmsProject({ validationStatus: "connected", isActive: false });

    const projects = await listScheduledReconciliationProjects();

    expect(projects).toContainEqual({
      id: included.project.id,
      organizationId: included.organization.id,
      providerKind: "phrase",
      providerCredentialId: included.credential.id,
    });
    expect(
      projects.some(
        (project) =>
          project.organizationId === included.organization.id && project.id !== included.project.id,
      ),
    ).toBe(false);
  });

  it("enqueues scheduled sync intents and starts reconciliation workflows", async () => {
    const { organization, credential, project } = await createExternalTmsProject();
    const enqueue = vi.fn(async (_event: ProviderWebhookReconciliationEventData) => ({
      ids: ["workflow-1"],
    }));

    const results = await runScheduledReconciliation({
      forceSchedule: "incremental",
      config: {
        ...DEFAULT_SCHEDULED_RECONCILIATION_CONFIG,
        maxIntentsPerTick: 10,
      },
      queue: { enqueue },
      listCredentials: async () => [
        {
          id: credential.id,
          organizationId: organization.id,
          providerKind: "phrase",
          validationStatus: "connected",
        },
      ],
      listProjects: async () => [
        {
          id: project.id,
          organizationId: organization.id,
          providerKind: "phrase",
          providerCredentialId: credential.id,
        },
      ],
    });

    expect(results).toEqual([
      {
        schedule: "incremental",
        intentsEnqueued: 2,
        intentsCoalesced: 0,
        intentsSkipped: 0,
        credentialsSkipped: 0,
        projectsSkipped: 0,
        auditsCompleted: 0,
        healthChecksCompleted: 0,
      },
    ]);

    const intents = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.organizationId, organization.id));

    expect(intents).toHaveLength(2);
    expect(new Set(intents.map((intent) => intent.syncKind))).toEqual(
      new Set(["file_key_scan", "job_task_scan"]),
    );
    expect(intents.every((intent) => intent.cause === "scheduled")).toBe(true);
    expect(intents.every((intent) => intent.projectId === project.id)).toBe(true);
    expect(intents.every((intent) => intent.providerCredentialId === credential.id)).toBe(true);

    expect(enqueue).toHaveBeenCalledTimes(2);
    const firstQueuedEvent = enqueue.mock.calls.at(0)?.[0];
    expect(firstQueuedEvent).toMatchObject({
      organizationId: organization.id,
      providerKind: "phrase",
      providerWebhookEventId: "",
      subscriptionId: "",
    });
  });

  it("enqueues credential-level project scans during full reconciliation", async () => {
    const { organization, credential, project } = await createExternalTmsProject();
    const enqueue = vi.fn(async (_event: ProviderWebhookReconciliationEventData) => ({
      ids: ["workflow-1"],
    }));

    await runScheduledReconciliation({
      forceSchedule: "full",
      config: {
        ...DEFAULT_SCHEDULED_RECONCILIATION_CONFIG,
        maxIntentsPerTick: 20,
      },
      queue: { enqueue },
      listCredentials: async () => [
        {
          id: credential.id,
          organizationId: organization.id,
          providerKind: "phrase",
          validationStatus: "connected",
        },
      ],
      listProjects: async () => [
        {
          id: project.id,
          organizationId: organization.id,
          providerKind: "phrase",
          providerCredentialId: credential.id,
        },
      ],
    });

    const intents = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.organizationId, organization.id));

    const projectScan = intents.find((intent) => intent.syncKind === "project_scan");
    expect(projectScan).toMatchObject({
      organizationId: organization.id,
      providerCredentialId: credential.id,
      projectId: null,
      cause: "scheduled",
    });
    expect(intents.some((intent) => intent.syncKind === "tm_scan")).toBe(true);
  });

  it("counts projects skipped when the intent budget is exhausted", async () => {
    const { organization, credential, project } = await createExternalTmsProject();
    const secondProject = await createExternalTmsProject();
    const enqueue = vi.fn(async (_event: ProviderWebhookReconciliationEventData) => ({
      ids: ["workflow-1"],
    }));

    const results = await runScheduledReconciliation({
      forceSchedule: "incremental",
      config: {
        ...DEFAULT_SCHEDULED_RECONCILIATION_CONFIG,
        maxIntentsPerTick: 1,
      },
      queue: { enqueue },
      listCredentials: async () => [
        {
          id: credential.id,
          organizationId: organization.id,
          providerKind: "phrase",
          validationStatus: "connected",
        },
      ],
      listProjects: async () => [
        {
          id: project.id,
          organizationId: organization.id,
          providerKind: "phrase",
          providerCredentialId: credential.id,
        },
        {
          id: secondProject.project.id,
          organizationId: secondProject.organization.id,
          providerKind: "phrase",
          providerCredentialId: secondProject.credential.id,
        },
      ],
    });

    expect(results).toEqual([
      {
        schedule: "incremental",
        intentsEnqueued: 1,
        intentsCoalesced: 0,
        intentsSkipped: 1,
        credentialsSkipped: 0,
        projectsSkipped: 1,
        auditsCompleted: 0,
        healthChecksCompleted: 0,
      },
    ]);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
