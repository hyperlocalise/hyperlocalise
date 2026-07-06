import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import {
  appendAgentTaskRunEvent,
  createOrReuseActiveAgentTaskRun,
  getAgentTaskRun,
  listAgentTaskRunEvents,
  startAgentTaskRun,
} from "@/lib/agent-runtime/task-runs/agent-task-runs";
import { db, schema } from "@/lib/database";

async function seedOrganization() {
  const id = randomUUID();
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      id,
      workosOrganizationId: `org_${id}`,
      name: "Agent Task Run Test",
      slug: `agent-task-run-${id}`,
    })
    .returning();

  if (!organization) {
    throw new Error("failed to seed organization");
  }

  return organization;
}

const organizationIds: string[] = [];

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  for (const organizationId of organizationIds.splice(0)) {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
  }
});

describe("agent task runs", () => {
  it("creates and reuses active runs by idempotency key", async () => {
    const organization = await seedOrganization();
    organizationIds.push(organization.id);

    const first = await createOrReuseActiveAgentTaskRun({
      organizationId: organization.id,
      projectId: "project_1",
      surface: "cat",
      kind: "repository_context_lookup",
      idempotencyKey: "ctx:project_1:home.title",
      inputSnapshot: { stringKey: "home.title" },
    });

    const second = await createOrReuseActiveAgentTaskRun({
      organizationId: organization.id,
      projectId: "project_1",
      surface: "cat",
      kind: "repository_context_lookup",
      idempotencyKey: "ctx:project_1:home.title",
      inputSnapshot: { stringKey: "home.title" },
    });

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.run.id).toBe(first.run.id);
  });

  it("appends sequenced events and updates the current stage", async () => {
    const organization = await seedOrganization();
    organizationIds.push(organization.id);
    const { run } = await createOrReuseActiveAgentTaskRun({
      organizationId: organization.id,
      surface: "cat",
      kind: "repository_context_lookup",
      idempotencyKey: "ctx:project_2:home.subtitle",
    });

    await startAgentTaskRun({
      organizationId: organization.id,
      runId: run.id,
      currentStage: "queued",
    });
    await appendAgentTaskRunEvent({
      organizationId: organization.id,
      runId: run.id,
      type: "stage",
      stage: "checking_cache",
      message: "Checking saved repository context",
    });
    await appendAgentTaskRunEvent({
      organizationId: organization.id,
      runId: run.id,
      type: "stage",
      stage: "resolving_repository",
      message: "Opening connected GitHub repository",
    });

    const events = await listAgentTaskRunEvents({
      organizationId: organization.id,
      runId: run.id,
    });
    const updatedRun = await getAgentTaskRun({
      organizationId: organization.id,
      runId: run.id,
    });

    expect(events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(events.map((event) => event.stage)).toEqual([
      "checking_cache",
      "resolving_repository",
    ]);
    expect(updatedRun?.currentStage).toBe("resolving_repository");
  });
});
