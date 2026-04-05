import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { app } from "@/api/app";
import { AUTH_CONTEXT_HEADER, type WorkosAuthIdentity } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";

const client = testClient(app);
const createdWorkosUserIds = new Set<string>();
const createdWorkosOrganizationIds = new Set<string>();

type ProjectRecord = {
  id: string;
  organizationId: string;
  createdByUserId: string | null;
  name: string;
  description: string;
  translationContext: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectResponse = {
  project: ProjectRecord;
};

type ProjectsResponse = {
  projects: ProjectRecord[];
};

function createWorkosIdentity(): WorkosAuthIdentity {
  return createWorkosIdentityWithRole("owner");
}

function createWorkosIdentityWithRole(
  role: WorkosAuthIdentity["membership"]["role"],
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

async function createProjectViaApi(
  identity: WorkosAuthIdentity,
  input?: Partial<{
    name: string;
    description: string;
    translationContext: string;
  }>,
) {
  return client.api.project.$post(
    {
      json: {
        name: input?.name ?? "Marketing Site",
        description: input?.description ?? "Primary website strings",
        translationContext: input?.translationContext ?? "Use a concise product-marketing tone.",
      },
    },
    {
      headers: {
        [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
      },
    },
  );
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

describe("projectRoutes", () => {
  it("returns 401 when auth context is missing", async () => {
    const response = await client.api.project.$get();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "unauthorized",
    });
  });

  it("lists projects for the current organization", async () => {
    const identity = createWorkosIdentity();
    await createProjectViaApi(identity, { name: "Project One" });
    await createProjectViaApi(identity, { name: "Project Two" });

    const otherIdentity = createWorkosIdentity();
    await createProjectViaApi(otherIdentity, { name: "Other Org Project" });

    const response = await client.api.project.$get(
      {},
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as ProjectsResponse;
    expect(body.projects).toHaveLength(2);
    expect(body.projects.map((project) => project.name)).toEqual(["Project Two", "Project One"]);
  });

  it("creates a project with validated input", async () => {
    const identity = createWorkosIdentity();
    const response = await createProjectViaApi(identity, {
      name: "Docs",
      description: "Documentation content",
      translationContext: "Keep terminology consistent.",
    });

    expect(response.status).toBe(201);

    const body = (await response.json()) as ProjectResponse;
    expect(body.project.id).toMatch(/^project_/);
    expect(body.project.name).toBe("Docs");
    expect(body.project.description).toBe("Documentation content");
    expect(body.project.translationContext).toBe("Keep terminology consistent.");
  });

  it("fills default values for optional create fields", async () => {
    const identity = createWorkosIdentity();
    const response = await client.api.project.$post(
      {
        json: {
          name: "Docs",
        },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );

    expect(response.status).toBe(201);

    const body = (await response.json()) as ProjectResponse;
    expect(body.project.name).toBe("Docs");
    expect(body.project.description).toBe("");
    expect(body.project.translationContext).toBe("");
  });

  it("returns 400 for invalid create payloads", async () => {
    const identity = createWorkosIdentity();
    const response = await client.api.project.$post(
      {
        json: {
          name: "   ",
        },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_project_payload",
    });
  });

  it("returns 403 when a member creates a project", async () => {
    const identity = createWorkosIdentityWithRole("member");
    const response = await client.api.project.$post(
      {
        json: {
          name: "Docs",
          description: "Documentation content",
          translationContext: "Keep terminology consistent.",
        },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "forbidden",
    });
  });

  it("returns a project by id", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const response = await client.api.project[":projectId"].$get(
      {
        param: { projectId: createdBody.project.id },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as ProjectResponse;
    expect(body.project.id).toBe(createdBody.project.id);
    expect(body.project.name).toBe("Marketing Site");
  });

  it("updates an existing project", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const response = await client.api.project[":projectId"].$patch(
      {
        param: { projectId: createdBody.project.id },
        json: {
          name: "Docs v2",
        },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as ProjectResponse;
    expect(body.project.id).toBe(createdBody.project.id);
    expect(body.project.name).toBe("Docs v2");
  });

  it("returns 400 for invalid patch payloads", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const emptyResponse = await client.api.project[":projectId"].$patch(
      {
        param: { projectId: createdBody.project.id },
        json: {},
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );

    expect(emptyResponse.status).toBe(400);
    await expect(emptyResponse.json()).resolves.toEqual({
      error: "invalid_project_payload",
    });

    const invalidNameResponse = await client.api.project[":projectId"].$patch(
      {
        param: { projectId: createdBody.project.id },
        json: {
          name: "   ",
        },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );

    expect(invalidNameResponse.status).toBe(400);
    await expect(invalidNameResponse.json()).resolves.toEqual({
      error: "invalid_project_payload",
    });
  });

  it("returns 404 when another organization fetches a project", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(ownerIdentity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const otherIdentity = createWorkosIdentity();
    const response = await client.api.project[":projectId"].$get(
      {
        param: { projectId: createdBody.project.id },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(otherIdentity),
        },
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "project_not_found",
    });
  });

  it("returns 404 when another organization updates a project", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(ownerIdentity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const otherIdentity = createWorkosIdentity();
    const response = await client.api.project[":projectId"].$patch(
      {
        param: { projectId: createdBody.project.id },
        json: {
          name: "Should Not Apply",
        },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(otherIdentity),
        },
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "project_not_found",
    });
  });

  it("returns 403 when a member updates a project", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(ownerIdentity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const memberIdentity = createWorkosIdentityWithRole("member");
    const response = await client.api.project[":projectId"].$patch(
      {
        param: { projectId: createdBody.project.id },
        json: {
          name: "Should Not Apply",
        },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(memberIdentity),
        },
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "forbidden",
    });
  });

  it("returns 404 when a project does not exist", async () => {
    const identity = createWorkosIdentity();
    const response = await client.api.project[":projectId"].$get(
      {
        param: { projectId: `project_missing_${randomUUID()}` },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "project_not_found",
    });
  });

  it("deletes an existing project", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const response = await client.api.project[":projectId"].$delete(
      {
        param: { projectId: createdBody.project.id },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );

    expect(response.status).toBe(204);

    const fetchResponse = await client.api.project[":projectId"].$get(
      {
        param: { projectId: createdBody.project.id },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );

    expect(fetchResponse.status).toBe(404);
  });

  it("returns 404 when another organization deletes a project", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(ownerIdentity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const otherIdentity = createWorkosIdentity();
    const response = await client.api.project[":projectId"].$delete(
      {
        param: { projectId: createdBody.project.id },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(otherIdentity),
        },
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "project_not_found",
    });

    const fetchResponse = await client.api.project[":projectId"].$get(
      {
        param: { projectId: createdBody.project.id },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(ownerIdentity),
        },
      },
    );

    expect(fetchResponse.status).toBe(200);
  });

  it("returns 404 when deleting a project that does not exist", async () => {
    const identity = createWorkosIdentity();
    const response = await client.api.project[":projectId"].$delete(
      {
        param: { projectId: `project_missing_${randomUUID()}` },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(identity),
        },
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "project_not_found",
    });
  });

  it("returns 403 when a member deletes a project", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(ownerIdentity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const memberIdentity = createWorkosIdentityWithRole("member");
    const response = await client.api.project[":projectId"].$delete(
      {
        param: { projectId: createdBody.project.id },
      },
      {
        headers: {
          [AUTH_CONTEXT_HEADER]: JSON.stringify(memberIdentity),
        },
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "forbidden",
    });
  });
});
