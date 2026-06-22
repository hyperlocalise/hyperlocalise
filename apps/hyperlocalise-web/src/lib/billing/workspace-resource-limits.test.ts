import "dotenv/config";

import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it, afterEach } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { isErr } from "@/lib/primitives/result/results";
import {
  ensureWorkspaceResourceLimitAvailable,
  withWorkspaceResourceLimit,
  workspaceResourceFeatureIds,
} from "./workspace-resource-limits";

const authFixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await authFixture.cleanup();
});

async function createOrganization() {
  const { organization, user } = await authFixture.createLocalWorkosIdentity();
  return { organization, user };
}

describe("workspace resource limits", () => {
  it("allows the first Free project and blocks the next one with the local fallback", async () => {
    const { organization, user } = await createOrganization();

    const firstProjectCheck = await ensureWorkspaceResourceLimitAvailable({
      organizationId: organization.id,
      featureId: workspaceResourceFeatureIds.projects,
      autumnApiKey: "",
    });

    expect(firstProjectCheck.ok).toBe(true);

    await db.insert(schema.projects).values({
      id: `project_${randomUUID()}`,
      organizationId: organization.id,
      createdByUserId: user.id,
      name: "Existing project",
      description: "",
      translationContext: "",
      source: "native",
      sourceLocale: "en",
      targetLocales: ["fr"],
    });

    const secondProjectCheck = await ensureWorkspaceResourceLimitAvailable({
      organizationId: organization.id,
      featureId: workspaceResourceFeatureIds.projects,
      autumnApiKey: "",
    });

    expect(secondProjectCheck).toMatchObject({
      ok: false,
      error: {
        code: "workspace_resource_limit_reached",
        featureId: workspaceResourceFeatureIds.projects,
        currentUsage: 1,
        requestedUsage: 2,
      },
    });
  });

  it("blocks Free automations because the fallback limit is zero", async () => {
    const { organization } = await createOrganization();

    const result = await ensureWorkspaceResourceLimitAvailable({
      organizationId: organization.id,
      featureId: workspaceResourceFeatureIds.automations,
      autumnApiKey: "",
    });

    expect(isErr(result)).toBe(true);
    expect(result).toMatchObject({
      error: {
        code: "workspace_resource_limit_reached",
        featureId: workspaceResourceFeatureIds.automations,
        currentUsage: 0,
        requestedUsage: 1,
      },
    });
  });

  it("allows only one concurrent project when the local fallback limit is one", async () => {
    const { organization, user } = await createOrganization();

    const results = await Promise.all(
      Array.from({ length: 2 }, () =>
        withWorkspaceResourceLimit(
          {
            organizationId: organization.id,
            featureId: workspaceResourceFeatureIds.projects,
            autumnApiKey: "",
          },
          async (tx) => {
            const [project] = await tx
              .insert(schema.projects)
              .values({
                id: `project_${randomUUID()}`,
                organizationId: organization.id,
                createdByUserId: user.id,
                name: "Concurrent project",
                description: "",
                translationContext: "",
                source: "native",
                sourceLocale: "en",
                targetLocales: ["fr"],
              })
              .returning();

            return project;
          },
        ),
      ),
    );

    const successes = results.filter((result) => result.ok);
    const failures = results.filter((result) => !result.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      ok: false,
      error: {
        code: "workspace_resource_limit_reached",
        featureId: workspaceResourceFeatureIds.projects,
        currentUsage: 1,
        requestedUsage: 2,
      },
    });
  });
});
