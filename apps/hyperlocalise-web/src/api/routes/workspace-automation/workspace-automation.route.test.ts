import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { resolveApiAuthContextFromSessionMock, workspaceAutomationExecutionEnqueueMock } =
  vi.hoisted(() => ({
    resolveApiAuthContextFromSessionMock: vi.fn(
      (options) =>
        globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
        globalThis.__testApiAuthContext ??
        null,
    ),
    workspaceAutomationExecutionEnqueueMock: vi.fn(async () => ({ ids: ["workflow-run-1"] })),
  }));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/workflows/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/workflows/adapters")>();
  return {
    ...actual,
    createWorkspaceAutomationExecutionQueue: vi.fn(() => ({
      enqueue: workspaceAutomationExecutionEnqueueMock,
    })),
  };
});

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";

const client = testClient(createApp());
const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

async function getOrganizationId(workosOrganizationId: string) {
  const [organization] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.workosOrganizationId, workosOrganizationId))
    .limit(1);

  if (!organization) {
    throw new Error("expected test organization");
  }

  return organization.id;
}

async function seedProject(input: { organizationId: string; userId?: string }) {
  const projectId = `project-${crypto.randomUUID()}`;
  await db.insert(schema.projects).values({
    id: projectId,
    organizationId: input.organizationId,
    createdByUserId: input.userId ?? null,
    name: "Website",
  });

  return projectId;
}

async function seedGithubRepository(input: { organizationId: string }) {
  const numericSuffix = BigInt(`0x${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`)
    .toString()
    .slice(0, 12);
  const githubInstallationId = `7${numericSuffix}`;
  const githubRepositoryId = `6${numericSuffix}`;

  await db.insert(schema.githubInstallations).values({
    organizationId: input.organizationId,
    githubInstallationId,
    githubAppId: "123",
    accountLogin: "hyperlocalise",
    accountType: "Organization",
  });

  const [repository] = await db
    .insert(schema.githubInstallationRepositories)
    .values({
      organizationId: input.organizationId,
      githubInstallationId,
      githubRepositoryId,
      owner: "hyperlocalise",
      name: `web-${numericSuffix}`,
      fullName: `hyperlocalise/web-${numericSuffix}`,
      private: false,
      archived: false,
      defaultBranch: "main",
      enabled: true,
    })
    .returning();

  if (!repository) {
    throw new Error("failed to seed repository");
  }

  return repository;
}

describe("workspace automation routes", () => {
  it("creates, reads, updates, lists, and archives automations for an operator", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createdResponse = await client.api.orgs[":organizationSlug"].automations.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Repository translation check",
          instructions: "Check localization health for the repository.",
          triggerConfig: { mode: "manual" },
          repositoryTarget: { kind: "none" },
          toolConfig: {},
        },
      },
      { headers },
    );

    expect(createdResponse.status).toBe(201);
    const createdBody = (await createdResponse.json()) as {
      automation: { id: string; name: string; configVersion: number };
      recentRuns: unknown[];
    };
    expect(createdBody.automation).toMatchObject({
      name: "Repository translation check",
      configVersion: 1,
    });
    expect(createdBody.recentRuns).toEqual([]);

    const listedResponse = await client.api.orgs[":organizationSlug"].automations.$get(
      { param: { organizationSlug }, query: { status: "active", limit: "50", offset: "0" } },
      { headers },
    );
    expect(listedResponse.status).toBe(200);
    await expect(listedResponse.json()).resolves.toMatchObject({
      automations: [{ id: createdBody.automation.id }],
    });

    const updatedResponse = await client.api.orgs[":organizationSlug"].automations[
      ":automationId"
    ].$patch(
      {
        param: { organizationSlug, automationId: createdBody.automation.id },
        json: { instructions: "Run the updated repository translation checks." },
      },
      { headers },
    );
    expect(updatedResponse.status).toBe(200);
    await expect(updatedResponse.json()).resolves.toMatchObject({
      automation: {
        id: createdBody.automation.id,
        configVersion: 2,
        instructions: "Run the updated repository translation checks.",
      },
      recentRuns: [],
    });

    const readResponse = await client.api.orgs[":organizationSlug"].automations[
      ":automationId"
    ].$get({ param: { organizationSlug, automationId: createdBody.automation.id } }, { headers });
    expect(readResponse.status).toBe(200);
    await expect(readResponse.json()).resolves.toMatchObject({
      automation: { id: createdBody.automation.id },
      recentRuns: [],
    });

    const deletedResponse = await client.api.orgs[":organizationSlug"].automations[
      ":automationId"
    ].$delete(
      { param: { organizationSlug, automationId: createdBody.automation.id } },
      { headers },
    );
    expect(deletedResponse.status).toBe(204);
    await expect(deletedResponse.text()).resolves.toBe("");
  });

  it("denies automation management for non-operators", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].automations.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        query: { limit: "50", offset: "0" },
      },
      { headers },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "forbidden" });
  });

  it("returns stable errors for invalid payloads and missing automations", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const invalidResponse = await client.api.orgs[":organizationSlug"].automations.$post(
      {
        param: { organizationSlug },
        json: {
          name: "",
          instructions: "",
          triggerConfig: { mode: "manual" },
          repositoryTarget: { kind: "none" },
          toolConfig: {},
        },
      },
      { headers },
    );

    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      error: "invalid_workspace_automation_payload",
    });

    const missingResponse = await client.api.orgs[":organizationSlug"].automations[
      ":automationId"
    ].$get({ param: { organizationSlug, automationId: crypto.randomUUID() } }, { headers });

    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toMatchObject({
      error: "workspace_automation_not_found",
    });
  });

  it("returns stable errors for invalid automation list query params", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const listResponse = await client.api.orgs[":organizationSlug"].automations.$get(
      {
        param: { organizationSlug },
        query: { status: "invalid_value", limit: "50", offset: "0" } as never,
      },
      { headers },
    );

    expect(listResponse.status).toBe(400);
    await expect(listResponse.json()).resolves.toMatchObject({
      error: "invalid_query_params",
    });

    const runsResponse = await client.api.orgs[":organizationSlug"].automations[
      ":automationId"
    ].runs.$get(
      {
        param: { organizationSlug, automationId: crypto.randomUUID() },
        query: { limit: "invalid", offset: "0" },
      },
      { headers },
    );

    expect(runsResponse.status).toBe(400);
    await expect(runsResponse.json()).resolves.toMatchObject({
      error: "invalid_query_params",
    });
  });

  it("returns stable errors for invalid tool and trigger configuration", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].automations.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: {
          name: "Broken GitHub automation",
          instructions: "Run GitHub automation.",
          triggerConfig: { mode: "manual" },
          repositoryTarget: { kind: "none" },
          toolConfig: {
            github: {
              enabled: true,
              mode: "sync",
              pushSource: true,
              pullTranslations: false,
              validation: false,
            },
          },
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "github_repository_target_required",
    });
  });

  it("rejects manual runs without enabled workflow tools", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationId = await getOrganizationId(identity.organization.workosOrganizationId);
    const projectId = await seedProject({ organizationId });
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createdResponse = await client.api.orgs[":organizationSlug"].automations.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Manual repository automation",
          instructions: "Run manual automation.",
          triggerConfig: { mode: "manual" },
          repositoryTarget: { kind: "none" },
          toolConfig: {
            github: {
              enabled: false,
              mode: "sync",
              projectId,
              pushSource: false,
              pullTranslations: false,
              validation: false,
            },
          },
        },
      },
      { headers },
    );
    const created = (await createdResponse.json()) as { automation: { id: string } };

    const runPayload = {
      idempotencyKey: `manual:${created.automation.id}:test-run`,
      inputSnapshot: { reason: "operator_test" },
    };
    const firstRunResponse = await client.api.orgs[":organizationSlug"].automations[
      ":automationId"
    ].runs.$post(
      {
        param: { organizationSlug, automationId: created.automation.id },
        json: runPayload,
      },
      { headers },
    );

    expect(firstRunResponse.status).toBe(400);
    await expect(firstRunResponse.json()).resolves.toMatchObject({
      error: "manual_run_not_supported",
    });
  });

  it("creates idempotent queued manual runs and returns recent run metadata", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationId = await getOrganizationId(identity.organization.workosOrganizationId);
    const projectId = await seedProject({ organizationId });
    const repository = await seedGithubRepository({ organizationId });
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createdResponse = await client.api.orgs[":organizationSlug"].automations.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Manual repository automation",
          instructions: "Run manual automation.",
          triggerConfig: { mode: "manual" },
          repositoryTarget: {
            kind: "github",
            githubInstallationRepositoryId: repository.id,
          },
          toolConfig: {
            github: {
              enabled: true,
              mode: "sync",
              projectId,
              pushSource: true,
              pullTranslations: false,
              validation: false,
            },
          },
        },
      },
      { headers },
    );
    const created = (await createdResponse.json()) as { automation: { id: string } };

    const runPayload = {
      idempotencyKey: `manual:${created.automation.id}:test-run`,
      inputSnapshot: { reason: "operator_test" },
    };
    const firstRunResponse = await client.api.orgs[":organizationSlug"].automations[
      ":automationId"
    ].runs.$post(
      {
        param: { organizationSlug, automationId: created.automation.id },
        json: runPayload,
      },
      { headers },
    );
    const secondRunResponse = await client.api.orgs[":organizationSlug"].automations[
      ":automationId"
    ].runs.$post(
      {
        param: { organizationSlug, automationId: created.automation.id },
        json: runPayload,
      },
      { headers },
    );

    expect(firstRunResponse.status).toBe(202);
    expect(secondRunResponse.status).toBe(202);
    const firstRun = (await firstRunResponse.json()) as {
      automationRun: {
        id: string;
        status: string;
        idempotencyKey: string;
        outputSummary: { orchestratorEnqueuedAt?: string };
      };
      dispatch: { outcome: string; inserted: boolean };
    };
    const secondRun = (await secondRunResponse.json()) as {
      automationRun: { id: string; status: string; idempotencyKey: string };
      dispatch: { outcome: string; inserted: boolean };
    };
    expect(firstRun.dispatch).toMatchObject({ outcome: "enqueued", inserted: true });
    expect(secondRun.dispatch).toMatchObject({ outcome: "enqueued", inserted: false });
    expect(firstRun.automationRun.outputSummary.orchestratorEnqueuedAt).toBeTruthy();
    expect(workspaceAutomationExecutionEnqueueMock).toHaveBeenCalledTimes(1);
    expect(secondRun.automationRun).toMatchObject({
      id: firstRun.automationRun.id,
      status: "queued",
      idempotencyKey: firstRun.automationRun.idempotencyKey,
    });

    const runsResponse = await client.api.orgs[":organizationSlug"].automations[
      ":automationId"
    ].runs.$get(
      {
        param: { organizationSlug, automationId: created.automation.id },
        query: { limit: "25", offset: "0" },
      },
      { headers },
    );
    expect(runsResponse.status).toBe(200);
    await expect(runsResponse.json()).resolves.toMatchObject({
      automationRuns: [{ id: firstRun.automationRun.id, triggerSource: "manual" }],
    });
  });
});
