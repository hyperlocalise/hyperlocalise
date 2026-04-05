import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { AUTH_CONTEXT_HEADER, type WorkosAuthIdentity } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";

const createdWorkosUserIds = new Set<string>();
const createdWorkosOrganizationIds = new Set<string>();

function createWorkosIdentity(
  role: WorkosAuthIdentity["membership"]["role"] = "owner",
): WorkosAuthIdentity {
  const suffix = randomUUID();
  const workosUserId = `user_${suffix}`;
  const workosOrganizationId = `org_${suffix}`;

  createdWorkosUserIds.add(workosUserId);
  createdWorkosOrganizationIds.add(workosOrganizationId);

  return {
    user: {
      workosUserId,
      email: `${suffix}@example.com`,
    },
    organization: {
      workosOrganizationId,
      name: `Example Org ${suffix}`,
      slug: `example-org-${suffix}`,
    },
    membership: {
      workosMembershipId: `membership_${suffix}`,
      role,
    },
  };
}

async function createClient() {
  const { app } = await import("@/api/app");
  return testClient(app);
}

async function seedProject(identity: WorkosAuthIdentity, name: string) {
  const client = await createClient();

  const createResponse = await client.api.project.$post(
    {
      json: {
        name,
      },
    },
    {
      headers: {
        [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
      },
    },
  );

  if (createResponse.status !== 201) {
    const body = await createResponse.json();
    throw new Error(`failed to seed project: ${JSON.stringify(body)}`);
  }

  const body = (await createResponse.json()) as { project: { id: string } };
  return body.project.id;
}

beforeAll(async () => {
  process.env.INNGEST_BASE_URL ??= "http://127.0.0.1:8288";
  process.env.INNGEST_EVENT_KEY ??= "local-test";

  await db.$client.query("select 1");
});

afterEach(async () => {
  for (const workosOrganizationId of createdWorkosOrganizationIds) {
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.workosOrganizationId, workosOrganizationId));
  }

  for (const workosUserId of createdWorkosUserIds) {
    await db.delete(schema.users).where(eq(schema.users.workosUserId, workosUserId));
  }

  createdWorkosOrganizationIds.clear();
  createdWorkosUserIds.clear();
});

describe("translationJobRoutes", () => {
  it("creates a translation job with real inngest enqueue, then fetches and lists it", async () => {
    const client = await createClient();

    const identity = createWorkosIdentity();
    const projectId = await seedProject(identity, "Docs");

    const createResponse = await client.api.translation.jobs.$post(
      {
        json: {
          projectId,
          type: "string",
          inputPayload: {
            sourceText: "Welcome",
            sourceLocale: "en",
            targetLocales: ["es"],
          },
        },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );

    expect(createResponse.status).toBe(201);
    const createdBody = (await createResponse.json()) as {
      job: {
        id: string;
        projectId: string;
        workflowRunId: string | null;
      };
    };

    expect(createdBody.job.id).toMatch(/^job_/);
    expect(createdBody.job.projectId).toBe(projectId);
    expect(createdBody.job.workflowRunId).toBeTruthy();

    const getResponse = await client.api.translation.jobs[":jobId"].$get(
      {
        param: {
          jobId: createdBody.job.id,
        },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );

    expect(getResponse.status).toBe(200);
    const getBody = (await getResponse.json()) as { job: { id: string; projectId: string } };
    expect(getBody.job.id).toBe(createdBody.job.id);
    expect(getBody.job.projectId).toBe(projectId);

    const listResponse = await client.api.translation.jobs.$get(
      {
        query: {
          projectId,
        },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );

    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as {
      jobs: Array<{ id: string; projectId: string }>;
    };
    expect(listBody.jobs).toHaveLength(1);
    expect(listBody.jobs[0]?.id).toBe(createdBody.job.id);
  });

  it("cancels a queued translation job", async () => {
    const client = await createClient();

    const identity = createWorkosIdentity();
    const projectId = await seedProject(identity, "Website");

    const createResponse = await client.api.translation.jobs.$post(
      {
        json: {
          projectId,
          type: "string",
          inputPayload: {
            sourceText: "Home",
            sourceLocale: "en",
            targetLocales: ["fr"],
          },
        },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );

    const createdBody = (await createResponse.json()) as { job: { id: string } };

    const cancelResponse = await client.api.translation.jobs[":jobId"].cancel.$post(
      {
        param: {
          jobId: createdBody.job.id,
        },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );

    expect(cancelResponse.status).toBe(200);
    const canceledBody = (await cancelResponse.json()) as {
      job: {
        id: string;
        status: string;
        outcomeKind: string | null;
        lastError: string | null;
      };
    };

    expect(canceledBody.job.id).toBe(createdBody.job.id);
    expect(canceledBody.job.status).toBe("failed");
    expect(canceledBody.job.outcomeKind).toBe("error");
    expect(canceledBody.job.lastError).toBe("canceled_by_user");
  });
});
