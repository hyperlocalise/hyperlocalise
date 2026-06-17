import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { buildAccessibleProjectsWhere } from "@/api/auth/team-access";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { listWorkspaceFiles } from "@/lib/projects/files/project-file-service";

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
      const accessibleProjectsWhere = await buildAccessibleProjectsWhere(c.var.auth);
      const projectWhere =
        query.projectId && query.projectId !== "all"
          ? and(accessibleProjectsWhere, eq(schema.projects.id, query.projectId))
          : accessibleProjectsWhere;

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
