import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { listWorkspaceFiles } from "@/lib/projects/project-files";

import { projectFilesQuerySchema } from "../project/project.schema";
import { invalidProjectPayloadResponse } from "../project/project.shared";

const validateWorkspaceFilesQuery = validator("query", (value, c) => {
  const parsed = projectFilesQuerySchema.safeParse(value);

  if (!parsed.success) {
    return invalidProjectPayloadResponse(c);
  }

  return parsed.data;
});

export function createWorkspaceFilesRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", validateWorkspaceFilesQuery, async (c) => {
      const query = c.req.valid("query");
      const projectWhere =
        query.projectId && query.projectId !== "all"
          ? and(
              eq(schema.projects.organizationId, c.var.auth.organization.localOrganizationId),
              eq(schema.projects.id, query.projectId),
            )
          : eq(schema.projects.organizationId, c.var.auth.organization.localOrganizationId);

      const projects = await db
        .select({ id: schema.projects.id, name: schema.projects.name })
        .from(schema.projects)
        .where(projectWhere)
        .orderBy(desc(schema.projects.createdAt));

      const files = await listWorkspaceFiles({
        organizationId: c.var.auth.organization.localOrganizationId,
        projects: projects.map((project) => ({
          projectId: project.id,
          projectName: project.name,
        })),
        query: {
          ...query,
          origin: query.origin ?? "all",
          resourceType: query.resourceType ?? "all",
          providerKind: query.providerKind ?? "all",
          locale: query.locale ?? "all",
          syncState: query.syncState ?? "all",
        },
      });

      return c.json({ files }, 200);
    });
}
