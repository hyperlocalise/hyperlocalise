/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { Hono } from "hono";
import { validator } from "hono/validator";

import { figmaCorsMiddleware } from "@/api/auth/figma-cors";
import { figmaSessionAuthMiddleware } from "@/api/auth/figma-session";
import { hasCapability } from "@/api/auth/policy";
import type { AuthVariables } from "@/api/auth/workos";
import { badRequestResponse, forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import {
  generateFigmaLocalization,
  getCurrentFigmaPageJob,
  getFigmaLocalizationStatus,
  pullLatestFigmaTranslations,
  startFigmaLocalization,
} from "@/lib/figma/localize-file";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { listOrganizationProjects } from "@/lib/projects/organization/organization-project-service";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

import {
  createFigmaJobBodySchema,
  currentFigmaJobQuerySchema,
  figmaJobIdParamSchema,
  pullFigmaTranslationsQuerySchema,
} from "./figma-integration.schema";

const validateCreateJobBody = validator("json", (value, c) => {
  const parsed = createFigmaJobBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_figma_job_payload",
      "Figma job payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateJobIdParams = validator("param", (value, c) => {
  const parsed = figmaJobIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_figma_job_id", "Figma job id is invalid.");
  }
  return parsed.data;
});

const validateCurrentJobQuery = validator("query", (value, c) => {
  const parsed = currentFigmaJobQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_figma_current_job_query",
      "Figma current job query is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validatePullQuery = validator("query", (value, c) => {
  const parsed = pullFigmaTranslationsQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_figma_translations_query",
      "Figma translations query is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

type CreateFigmaIntegrationRoutesOptions = {
  jobQueue?: JobQueue<TranslationJobEventData>;
  fileStorageAdapter?: FileStorageAdapter;
};

function localizeErrorResponse(c: Parameters<typeof badRequestResponse>[0], error: unknown) {
  const message = error instanceof Error ? error.message : "figma_localize_failed";
  const notFoundCodes = new Set([
    "figma_project_not_found",
    "translation_job_not_found",
    "job_not_found",
  ]);
  if (notFoundCodes.has(message)) {
    return notFoundResponse(c, message);
  }

  const badRequestCodes = new Set([
    "figma_no_text_segments",
    "job_not_enqueueable",
    "job_already_running",
    "file_translation_job_required",
    "native_job_required",
    "job_source_locale_not_in_project",
    "job_target_locale_not_in_project",
    "duplicate_job_target_locales",
    "invalid_job_source_locale",
    "invalid_job_target_locale",
  ]);
  if (badRequestCodes.has(message)) {
    return badRequestResponse(c, message);
  }

  return c.json(
    {
      error: "figma_localize_failed",
      message,
    },
    502,
  );
}

export function createFigmaIntegrationRoutes(options: CreateFigmaIntegrationRoutesOptions = {}) {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", figmaCorsMiddleware)
    .get("/health", async (c) => {
      return c.json({ ok: true }, 200);
    })
    .get("/session", figmaSessionAuthMiddleware, async (c) => {
      const auth = c.var.auth;
      return c.json(
        {
          session: {
            user: {
              email: auth.user.email,
              localUserId: auth.user.localUserId,
            },
            organization: {
              slug: auth.organization.slug ?? null,
              name: auth.organization.name,
              id: auth.organization.localOrganizationId,
            },
            organizations: auth.organizations
              .filter((organization) => Boolean(organization.slug))
              .map((organization) => ({
                slug: organization.slug,
                name: organization.name,
                id: organization.localOrganizationId,
              })),
          },
        },
        200,
      );
    })
    .get("/projects", figmaSessionAuthMiddleware, async (c) => {
      const projects = await listOrganizationProjects(c.var.auth);
      return c.json(
        {
          projects: projects.map((project) => ({
            id: project.id,
            name: project.name,
            sourceLocale: project.sourceLocale ?? "en",
            targetLocales: project.targetLocales ?? [],
          })),
        },
        200,
      );
    })
    .post("/jobs", figmaSessionAuthMiddleware, validateCreateJobBody, async (c) => {
      const auth = c.var.auth;
      if (!hasCapability(auth.membership.role, "jobs:create")) {
        return forbiddenResponse(
          c,
          "figma_jobs_create_forbidden",
          "You do not have permission to create translation jobs.",
        );
      }

      if (!options.jobQueue) {
        return c.json({ error: "translation_job_queue_unavailable" }, 503);
      }

      const payload = c.req.valid("json");
      try {
        const result = await startFigmaLocalization({
          auth,
          projectId: payload.projectId,
          fileKey: payload.fileKey,
          pageId: payload.pageId,
          fileName: payload.fileName,
          sourceLocale: payload.sourceLocale,
          targetLocales: payload.targetLocales,
          segments: payload.segments,
          generate: payload.generate,
          jobQueue: options.jobQueue,
          fileStorageAdapter: options.fileStorageAdapter,
        });
        return c.json({ job: result }, 201);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .get("/jobs/current", figmaSessionAuthMiddleware, validateCurrentJobQuery, async (c) => {
      const query = c.req.valid("query");
      try {
        const result = await getCurrentFigmaPageJob({
          auth: c.var.auth,
          fileKey: query.fileKey,
          pageId: query.pageId,
          projectId: query.projectId,
        });
        return c.json(result, 200);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .get("/jobs/:jobId", figmaSessionAuthMiddleware, validateJobIdParams, async (c) => {
      const { jobId } = c.req.valid("param");
      try {
        const status = await getFigmaLocalizationStatus({
          auth: c.var.auth,
          jobId,
        });
        return c.json({ job: status }, 200);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .post("/jobs/:jobId/generate", figmaSessionAuthMiddleware, validateJobIdParams, async (c) => {
      const auth = c.var.auth;
      if (!hasCapability(auth.membership.role, "jobs:create")) {
        return forbiddenResponse(
          c,
          "figma_jobs_create_forbidden",
          "You do not have permission to generate translations.",
        );
      }

      if (!options.jobQueue) {
        return c.json({ error: "translation_job_queue_unavailable" }, 503);
      }

      const { jobId } = c.req.valid("param");
      try {
        const result = await generateFigmaLocalization({
          auth,
          jobId,
          jobQueue: options.jobQueue,
        });
        return c.json({ job: { jobId: result.jobId, generated: true } }, 202);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .get("/translations", figmaSessionAuthMiddleware, validatePullQuery, async (c) => {
      const query = c.req.valid("query");
      try {
        const translations = await pullLatestFigmaTranslations({
          auth: c.var.auth,
          projectId: query.projectId,
          fileKey: query.fileKey,
          pageId: query.pageId,
        });
        return c.json({ translations }, 200);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    });
}
