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

import {
  figmaConnectionAuthMiddleware,
  type FigmaConnectionVariables,
} from "@/api/auth/figma-connection";
import { figmaCorsMiddleware } from "@/api/auth/figma-cors";
import { badRequestResponse, forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import {
  getFigmaConnectionSession,
  resolveTeamAccessForFigmaConnection,
  touchFigmaConnectionUsage,
} from "@/lib/figma/connections";
import {
  collectFigmaPage,
  generateFigmaLocaleJobs,
  generateFigmaLocalization,
  getAccessibleFigmaProject,
  getCurrentFigmaPageJob,
  getFigmaLocalizationStatus,
  listFigmaPageLocaleStatuses,
  pullFigmaPageLocaleContent,
  startFigmaLocalization,
} from "@/lib/figma/localize-file";
import { createLogger } from "@/lib/log";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";
import { env } from "@/lib/env";

import {
  collectFigmaPageBodySchema,
  createFigmaJobBodySchema,
  currentFigmaJobQuerySchema,
  figmaJobIdParamSchema,
  figmaLocalesQuerySchema,
  pullFigmaTranslationsQuerySchema,
} from "./figma-integration.schema";

const validateCollectBody = validator("json", (value, c) => {
  const parsed = collectFigmaPageBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_figma_collect_payload",
      "Figma collect payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateLocalesQuery = validator("query", (value, c) => {
  const parsed = figmaLocalesQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_figma_locales_query",
      "Figma locales query is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

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

const figmaIntegrationLogger = createLogger("figma-integration");

function localizeErrorResponse(
  c: Parameters<typeof badRequestResponse>[0] & { var: FigmaConnectionVariables },
  error: unknown,
) {
  const message = error instanceof Error ? error.message : "figma_localize_failed";
  const notFoundCodes = new Set([
    "figma_project_not_found",
    "figma_session_not_found",
    "translation_job_not_found",
    "job_not_found",
  ]);
  if (notFoundCodes.has(message)) {
    return notFoundResponse(c, message);
  }

  if (message === "figma_api_key_unauthorized") {
    return forbiddenResponse(c, message);
  }

  const badRequestCodes = new Set([
    "figma_no_text_segments",
    "figma_page_not_collected",
    "figma_source_ingest_timeout",
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

  figmaIntegrationLogger.warn("figma integration request failed", {
    connectionId: c.var.figmaConnection.id,
    organizationId: c.var.figmaConnection.organizationId,
    errorCode: message,
  });

  return c.json({ error: "figma_localize_failed" }, 500);
}

async function resolveConnectionAuth(connection: FigmaConnectionVariables["figmaConnection"]) {
  const auth = await resolveTeamAccessForFigmaConnection({
    organizationId: connection.organizationId,
    apiKeyId: connection.apiKeyId,
  });
  if (!auth) {
    throw new Error("figma_api_key_unauthorized");
  }
  return auth;
}

export function createFigmaIntegrationRoutes(options: CreateFigmaIntegrationRoutesOptions = {}) {
  return new Hono<{ Variables: FigmaConnectionVariables }>()
    .use("*", figmaCorsMiddleware)
    .get("/health", async (c) => {
      const figmaOauthConfigured = Boolean(env.FIGMA_OAUTH_CLIENT_ID);
      return c.json(
        {
          ok: true,
          figmaOauthConfigured,
          ...(figmaOauthConfigured && env.FIGMA_OAUTH_CLIENT_ID
            ? { figmaOauthClientId: env.FIGMA_OAUTH_CLIENT_ID }
            : {}),
        },
        200,
      );
    })
    .get("/session", figmaConnectionAuthMiddleware, async (c) => {
      const connection = c.var.figmaConnection;
      await touchFigmaConnectionUsage(connection.id);

      try {
        const session = await getFigmaConnectionSession({
          organizationId: connection.organizationId,
          connectionId: connection.id,
        });
        return c.json({ session }, 200);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .post("/collect", figmaConnectionAuthMiddleware, validateCollectBody, async (c) => {
      const payload = c.req.valid("json");
      const connection = c.var.figmaConnection;
      await touchFigmaConnectionUsage(connection.id);

      try {
        const auth = await resolveConnectionAuth(connection);
        const result = await collectFigmaPage({
          auth,
          apiKeyId: connection.apiKeyId,
          projectId: payload.projectId,
          fileKey: payload.fileKey,
          pageId: payload.pageId,
          fileName: payload.fileName,
          pageName: payload.pageName,
          segments: payload.segments,
          fileStorageAdapter: options.fileStorageAdapter,
        });
        return c.json(result, 201);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .get("/locales", figmaConnectionAuthMiddleware, validateLocalesQuery, async (c) => {
      const query = c.req.valid("query");
      const connection = c.var.figmaConnection;
      await touchFigmaConnectionUsage(connection.id);

      try {
        const auth = await resolveConnectionAuth(connection);
        const result = await listFigmaPageLocaleStatuses({
          auth,
          projectId: query.projectId,
          fileKey: query.fileKey,
          pageIds: query.pageIds,
        });
        return c.json(result, 200);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .post("/jobs", figmaConnectionAuthMiddleware, validateCreateJobBody, async (c) => {
      if (!options.jobQueue) {
        return c.json({ error: "translation_job_queue_unavailable" }, 503);
      }

      const payload = c.req.valid("json");
      const connection = c.var.figmaConnection;
      await touchFigmaConnectionUsage(connection.id);

      try {
        const auth = await resolveConnectionAuth(connection);
        const project = await getAccessibleFigmaProject(auth, payload.projectId);
        if (!project) {
          throw new Error("figma_project_not_found");
        }
        const sourceLocale = payload.sourceLocale?.trim() || project.sourceLocale?.trim() || "";
        const targetLocales = payload.targetLocales;

        if (payload.segments && payload.segments.length > 0) {
          const result = await startFigmaLocalization({
            auth,
            apiKeyId: connection.apiKeyId,
            projectId: payload.projectId,
            fileKey: payload.fileKey,
            pageId: payload.pageId,
            fileName: payload.fileName,
            pageName: payload.pageName,
            sourceLocale,
            targetLocales,
            segments: payload.segments,
            generate: payload.generate,
            jobQueue: options.jobQueue,
            fileStorageAdapter: options.fileStorageAdapter,
          });
          return c.json({ job: result }, 201);
        }

        const result = await generateFigmaLocaleJobs({
          auth,
          projectId: payload.projectId,
          fileKey: payload.fileKey,
          pageId: payload.pageId,
          sourceLocale,
          targetLocales,
          jobQueue: options.jobQueue,
        });
        return c.json({ job: result }, 201);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .get("/jobs/current", figmaConnectionAuthMiddleware, validateCurrentJobQuery, async (c) => {
      const query = c.req.valid("query");
      const connection = c.var.figmaConnection;
      await touchFigmaConnectionUsage(connection.id);

      try {
        const auth = await resolveConnectionAuth(connection);
        const result = await getCurrentFigmaPageJob({
          auth,
          fileKey: query.fileKey,
          pageId: query.pageId,
          projectId: query.projectId,
        });
        return c.json(result, 200);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .get("/jobs/:jobId", figmaConnectionAuthMiddleware, validateJobIdParams, async (c) => {
      const { jobId } = c.req.valid("param");
      const connection = c.var.figmaConnection;
      await touchFigmaConnectionUsage(connection.id);

      try {
        const auth = await resolveConnectionAuth(connection);
        const status = await getFigmaLocalizationStatus({
          auth,
          jobId,
        });
        return c.json({ job: status }, 200);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .post(
      "/jobs/:jobId/generate",
      figmaConnectionAuthMiddleware,
      validateJobIdParams,
      async (c) => {
        if (!options.jobQueue) {
          return c.json({ error: "translation_job_queue_unavailable" }, 503);
        }

        const { jobId } = c.req.valid("param");
        const connection = c.var.figmaConnection;
        await touchFigmaConnectionUsage(connection.id);

        try {
          const auth = await resolveConnectionAuth(connection);
          const result = await generateFigmaLocalization({
            auth,
            jobId,
            jobQueue: options.jobQueue,
          });
          return c.json({ job: { jobId: result.jobId, generated: true } }, 202);
        } catch (error) {
          return localizeErrorResponse(c, error);
        }
      },
    )
    .get("/translations", figmaConnectionAuthMiddleware, validatePullQuery, async (c) => {
      const query = c.req.valid("query");
      const connection = c.var.figmaConnection;
      await touchFigmaConnectionUsage(connection.id);

      try {
        const auth = await resolveConnectionAuth(connection);
        const pullResult = await pullFigmaPageLocaleContent({
          auth,
          projectId: query.projectId,
          fileKey: query.fileKey,
          pageId: query.pageId,
          locale: query.locale,
        });
        if (pullResult.kind === "source") {
          return c.json({ sourcePage: pullResult.sourcePage }, 200);
        }
        return c.json({ translations: pullResult.translations }, 200);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    });
}
