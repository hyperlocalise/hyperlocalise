import { validator } from "hono/validator";
import { Hono } from "hono";

import { isProjectMutationAllowed } from "@/api/auth/capability-guards";
import type { AuthVariables } from "@/api/auth/workos";
import { badRequestResponse, notFoundResponse } from "@/api/errors";
import { isErr } from "@/lib/primitives/result/results";
import {
  listProjectLocaleAssignments,
  replaceProjectLocaleAssignments,
} from "@/lib/projects/project-locale-assignment-service";

import {
  forbiddenResponse,
  getOwnedProject,
  getOwnedProjectRecord,
  projectNotFoundResponse,
  scheduleProjectNotFoundDiagnostics,
} from "./project.shared";
import {
  projectLocaleAssignmentParamsSchema,
  replaceProjectLocaleAssignmentsBodySchema,
} from "./project-locale-assignment.schema";

const validateProjectLocaleAssignmentParams = validator("param", (value, c) => {
  const parsed = projectLocaleAssignmentParamsSchema.safeParse(value);

  if (!parsed.success) {
    return projectNotFoundResponse(c);
  }

  return parsed.data;
});

const validateReplaceProjectLocaleAssignmentsBody = validator("json", (value, c) => {
  const parsed = replaceProjectLocaleAssignmentsBodySchema.safeParse(value);

  if (!parsed.success) {
    return badRequestResponse(c, "invalid_locale_assignment_payload", "Invalid locale assignments");
  }

  return parsed.data;
});

export function createProjectLocaleAssignmentRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .get("/", validateProjectLocaleAssignmentParams, async (c) => {
      const params = c.req.valid("param");
      const project = await getOwnedProject(c.var.auth, params.projectId);

      if (!project) {
        scheduleProjectNotFoundDiagnostics({
          auth: c.var.auth,
          projectId: params.projectId,
          route: "project.locale_assignments.list",
        });
        return projectNotFoundResponse(c);
      }

      const localeAssignments = await listProjectLocaleAssignments({
        organizationId: c.var.auth.organization.localOrganizationId,
        projectId: params.projectId,
      });

      return c.json({ localeAssignments }, 200);
    })
    .put(
      "/",
      validateProjectLocaleAssignmentParams,
      validateReplaceProjectLocaleAssignmentsBody,
      async (c) => {
        if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const payload = c.req.valid("json");
        const project = await getOwnedProjectRecord(c.var.auth, params.projectId);

        if (!project) {
          scheduleProjectNotFoundDiagnostics({
            auth: c.var.auth,
            projectId: params.projectId,
            route: "project.locale_assignments.replace",
          });
          return projectNotFoundResponse(c);
        }

        if (project.source !== "native") {
          return badRequestResponse(
            c,
            "native_project_required",
            "Locale assignments are only available for native projects",
          );
        }

        const result = await replaceProjectLocaleAssignments({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: params.projectId,
          assignments: payload.assignments,
        });

        if (isErr(result)) {
          if (result.error.code === "assignee_not_found") {
            return notFoundResponse(c, "assignee_not_found", "Assignee is not a workspace member");
          }

          return badRequestResponse(c, result.error.code, "Invalid locale assignments");
        }

        return c.json({ localeAssignments: result.value }, 200);
      },
    );
}
