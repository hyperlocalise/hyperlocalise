import "dotenv/config";

import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

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

async function seedProject(identity: WorkosAuthIdentity, name: string) {
  const { app } = await import("@/api/app");
  const client = testClient(app);

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

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function startFakeInngestServer() {
  const requests: {
    method: string;
    url: string;
    body: unknown;
  }[] = [];

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const body = await readJsonBody(req);

    requests.push({
      method: req.method ?? "",
      url: req.url ?? "",
      body,
    });

    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        ids: [`run_${randomUUID()}`],
        status: 200,
      }),
    );
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("failed to bind fake inngest server");
  }

  return {
    requests,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

beforeAll(async () => {
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
  it("creates a translation job, enqueues through inngest, then fetches and lists it", async () => {
    const fakeInngestServer = await startFakeInngestServer();

    process.env.INNGEST_EVENT_KEY = "test-event-key";
    process.env.INNGEST_BASE_URL = fakeInngestServer.baseUrl;

    const { app } = await import("@/api/app");
    const client = testClient(app);

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
    expect(createdBody.job.workflowRunId).toMatch(/^run_/);

    expect(fakeInngestServer.requests).toHaveLength(1);
    expect(fakeInngestServer.requests[0]?.method).toBe("POST");
    expect(fakeInngestServer.requests[0]?.url).toContain("test-event-key");
    expect(fakeInngestServer.requests[0]?.body).toMatchObject({
      name: "translation/job.queued",
      data: {
        jobId: createdBody.job.id,
        projectId,
      },
    });

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

    await fakeInngestServer.close();
  });

  it("cancels an in-flight translation job", async () => {
    const fakeInngestServer = await startFakeInngestServer();

    process.env.INNGEST_EVENT_KEY = "test-event-key";
    process.env.INNGEST_BASE_URL = fakeInngestServer.baseUrl;

    const { app } = await import("@/api/app");
    const client = testClient(app);

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

    await fakeInngestServer.close();
  });
});
