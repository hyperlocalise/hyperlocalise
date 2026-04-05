import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { z } from "zod";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";

import {
  createProjectBodySchema,
  projectIdParamsSchema,
  updateProjectBodySchema,
  type CreateProjectBody,
  type UpdateProjectBody,
} from "./project.schema";

type ProjectStore = {
  list(auth: ApiAuthContext): Promise<unknown>;
  create(auth: ApiAuthContext, payload: CreateProjectBody): Promise<unknown>;
  getById(auth: ApiAuthContext, projectId: string): Promise<unknown>;
  update(auth: ApiAuthContext, projectId: string, payload: UpdateProjectBody): Promise<unknown>;
  delete(auth: ApiAuthContext, projectId: string): Promise<boolean>;
};

const projectStore: ProjectStore = {
  async list(auth) {
    return db
      .select()
      .from(schema.translationProjects)
      .where(eq(schema.translationProjects.organizationId, auth.organization.localOrganizationId))
      .orderBy(desc(schema.translationProjects.createdAt));
  },
  async create(auth, payload) {
    const [project] = await db
      .insert(schema.translationProjects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: auth.organization.localOrganizationId,
        createdByUserId: auth.user.localUserId,
        name: payload.name,
        description: payload.description,
        translationContext: payload.translationContext,
      })
      .returning();

    return project;
  },
  async getById(auth, projectId) {
    const [project] = await db
      .select()
      .from(schema.translationProjects)
      .where(
        and(
          eq(schema.translationProjects.id, projectId),
          eq(schema.translationProjects.organizationId, auth.organization.localOrganizationId),
        ),
      )
      .limit(1);

    return project ?? null;
  },
  async update(auth, projectId, payload) {
    const [project] = await db
      .update(schema.translationProjects)
      .set(payload)
      .where(
        and(
          eq(schema.translationProjects.id, projectId),
          eq(schema.translationProjects.organizationId, auth.organization.localOrganizationId),
        ),
      )
      .returning();

    return project ?? null;
  },
  async delete(auth, projectId) {
    const deletedProjects = await db
      .delete(schema.translationProjects)
      .where(
        and(
          eq(schema.translationProjects.id, projectId),
          eq(schema.translationProjects.organizationId, auth.organization.localOrganizationId),
        ),
      )
      .returning({ id: schema.translationProjects.id });

    return deletedProjects.length > 0;
  },
};

async function parseJsonBody<TSchema extends z.ZodTypeAny>(
  c: { req: { json(): Promise<unknown> } },
  bodySchema: TSchema,
): Promise<z.infer<TSchema> | null> {
  let json: unknown;

  try {
    json = await c.req.json();
  } catch {
    return null;
  }

  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

function invalidProjectPayloadResponse(c: {
  json(body: { error: string }, status: 400): Response;
}) {
  return c.json({ error: "invalid_project_payload" }, 400);
}

function projectNotFoundResponse(c: { json(body: { error: string }, status: 404): Response }) {
  return c.json({ error: "project_not_found" }, 404);
}

export const projectRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", workosAuthMiddleware)
  .get("/", async (c) => {
    const projects = await projectStore.list(c.var.auth);
    return c.json({ projects }, 200);
  })
  .post("/", async (c) => {
    const payload = await parseJsonBody(c, createProjectBodySchema);

    if (!payload) {
      return invalidProjectPayloadResponse(c);
    }

    const project = await projectStore.create(c.var.auth, payload);
    return c.json({ project }, 201);
  })
  .get("/:projectId", async (c) => {
    const params = projectIdParamsSchema.safeParse(c.req.param());

    if (!params.success) {
      return projectNotFoundResponse(c);
    }

    const project = await projectStore.getById(c.var.auth, params.data.projectId);

    if (!project) {
      return projectNotFoundResponse(c);
    }

    return c.json({ project }, 200);
  })
  .patch("/:projectId", async (c) => {
    const params = projectIdParamsSchema.safeParse(c.req.param());

    if (!params.success) {
      return projectNotFoundResponse(c);
    }

    const payload = await parseJsonBody(c, updateProjectBodySchema);

    if (!payload) {
      return invalidProjectPayloadResponse(c);
    }

    const project = await projectStore.update(c.var.auth, params.data.projectId, payload);

    if (!project) {
      return projectNotFoundResponse(c);
    }

    return c.json({ project }, 200);
  })
  .delete("/:projectId", async (c) => {
    const params = projectIdParamsSchema.safeParse(c.req.param());

    if (!params.success) {
      return projectNotFoundResponse(c);
    }

    const deleted = await projectStore.delete(c.var.auth, params.data.projectId);

    if (!deleted) {
      return projectNotFoundResponse(c);
    }

    return c.body(null, 204);
  });
