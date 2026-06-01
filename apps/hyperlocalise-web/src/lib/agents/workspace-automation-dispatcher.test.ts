import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";
import { type Result } from "@/lib/primitives/result/results";

import { createWorkspaceAutomation, listWorkspaceAutomationRuns } from "./workspace-automations";

function expectOk<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error("expected ok result");
  }
  return result.value;
}
import { dispatchWorkspaceAutomationForSchedule } from "./workspace-automation-dispatcher";

const organizationIds: string[] = [];

async function seedDispatchScope() {
  const organizationId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const numericSuffix = BigInt(`0x${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`)
    .toString()
    .slice(0, 12);

  organizationIds.push(organizationId);

  await db.insert(schema.organizations).values({
    id: organizationId,
    workosOrganizationId: `org_${organizationId}`,
    slug: `workspace-dispatch-${organizationId.slice(0, 8)}`,
    name: "Workspace Dispatch Test Org",
  });

  await db.insert(schema.users).values({
    id: userId,
    workosUserId: `user_${userId}`,
    email: `${userId}@example.test`,
  });

  const projectId = `project-${organizationId.slice(0, 8)}`;
  await db.insert(schema.projects).values({
    id: projectId,
    organizationId,
    createdByUserId: userId,
    name: "Website",
  });

  const githubInstallationId = `7${numericSuffix}`;
  const githubRepositoryId = `6${numericSuffix}`;

  await db.insert(schema.githubInstallations).values({
    organizationId,
    githubInstallationId,
    githubAppId: "123",
    accountLogin: "hyperlocalise",
    accountType: "Organization",
  });

  const [repository] = await db
    .insert(schema.githubInstallationRepositories)
    .values({
      organizationId,
      githubInstallationId,
      githubRepositoryId,
      owner: "hyperlocalise",
      name: "web",
      fullName: "hyperlocalise/web",
      private: false,
      archived: false,
      defaultBranch: "main",
      enabled: true,
    })
    .returning();

  if (!repository) {
    throw new Error("failed to seed repository");
  }

  return {
    organizationId,
    userId,
    projectId,
    repository,
    githubInstallationId,
    githubRepositoryId,
  };
}

describe("workspace automation dispatcher", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    for (const organizationId of organizationIds.splice(0)) {
      await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    }
  });

  it("creates idempotent scheduled runs linked to github jobs", async () => {
    const scope = await seedDispatchScope();
    const scheduledRunAt = new Date("2026-06-01T08:00:00.000Z");
    const automation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Scheduled validation",
        instructions: "Run validation on a schedule.",
        triggerConfig: {
          mode: "scheduled",
          schedule: {
            cadence: "daily",
            hourUtc: 8,
            timezone: "UTC",
          },
        },
        repositoryTarget: {
          kind: "github",
          githubInstallationRepositoryId: scope.repository.id,
        },
        toolConfig: {
          github: {
            enabled: true,
            projectId: scope.projectId,
            pushSource: false,
            pullTranslations: false,
            validation: true,
          },
        },
        nextRunAt: scheduledRunAt,
      }),
    );

    const first = await dispatchWorkspaceAutomationForSchedule({
      automation,
      repository: {
        id: scope.repository.id,
        githubInstallationId: scope.githubInstallationId,
        githubRepositoryId: scope.githubRepositoryId,
      },
      scheduledRunAt,
    });
    const second = await dispatchWorkspaceAutomationForSchedule({
      automation,
      repository: {
        id: scope.repository.id,
        githubInstallationId: scope.githubInstallationId,
        githubRepositoryId: scope.githubRepositoryId,
      },
      scheduledRunAt,
    });

    expect(first?.outcome).toBe("enqueued");
    expect(second?.outcome).toBe("enqueued");
    expect(second?.inserted).toBe(false);

    const runs = await listWorkspaceAutomationRuns({
      automationId: automation.id,
      organizationId: scope.organizationId,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.githubRepositoryAutomationJobId).toBeTruthy();
  });
});
