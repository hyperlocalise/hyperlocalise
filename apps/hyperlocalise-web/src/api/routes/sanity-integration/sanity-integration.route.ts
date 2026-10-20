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
  sanityConnectionAuthMiddleware,
  type SanityConnectionVariables,
} from "@/api/auth/sanity-connection";
import { sanityCorsMiddleware } from "@/api/auth/sanity-cors";
import { badRequestResponse, forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import {
  getSanityConnectionSession,
  resolveTeamAccessForSanityConnection,
  touchSanityConnectionUsage,
} from "@/lib/sanity/connections";
import {
  collectSanityDocument,
  generateSanityLocalization,
  generateSanityLocaleJobs,
  getAccessibleSanityProject,
  getCurrentSanityDocumentJob,
  getSanityLocalizationStatus,
  listSanityDocumentLocaleStatuses,
  pullSanityDocumentLocaleContent,
  startSanityLocalization,
} from "@/lib/sanity/localize-document";
import { createLogger } from "@/lib/log";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";
import { env } from "@/lib/env";
import { buildSanityPluginApplyPlan } from "@/lib/sanity/build-apply-plan";
import type { SanityDocumentRecord } from "@/lib/sanity/sanity-field-value";

import {
  applySanityPlanBodySchema,
  collectSanityDocumentBodySchema,
  createSanityJobBodySchema,
  currentSanityJobQuerySchema,
  pullSanityTranslationsQuerySchema,
  sanityJobIdParamSchema,
  sanityLocalesQuerySchema,
} from "./sanity-integration.schema";

const validateCollectBody = validator("json", (value, c) => {
  const parsed = collectSanityDocumentBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_sanity_collect_payload",
      "Sanity collect payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateLocalesQuery = validator("query", (value, c) => {
  const parsed = sanityLocalesQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_sanity_locales_query",
      "Sanity locales query is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateCreateJobBody = validator("json", (value, c) => {
  const parsed = createSanityJobBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_sanity_job_payload",
      "Sanity job payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateJobIdParams = validator("param", (value, c) => {
  const parsed = sanityJobIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_sanity_job_id", "Sanity job id is invalid.");
  }
  return parsed.data;
});

const validateCurrentJobQuery = validator("query", (value, c) => {
  const parsed = currentSanityJobQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_sanity_current_job_query",
      "Sanity current job query is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateApplyPlanBody = validator("json", (value, c) => {
  const parsed = applySanityPlanBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_sanity_apply_plan_payload",
      "Sanity apply plan payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validatePullQuery = validator("query", (value, c) => {
  const parsed = pullSanityTranslationsQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_sanity_translations_query",
      "Sanity translations query is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

type CreateSanityIntegrationRoutesOptions = {
  jobQueue?: JobQueue<TranslationJobEventData>;
  fileStorageAdapter?: FileStorageAdapter;
};

const sanityIntegrationLogger = createLogger("sanity-integration");

function localizeErrorResponse(
  c: Parameters<typeof badRequestResponse>[0] & { var: SanityConnectionVariables },
  error: unknown,
) {
  const message = error instanceof Error ? error.message : "sanity_localize_failed";
  const notFoundCodes = new Set([
    "sanity_project_not_found",
    "sanity_session_not_found",
    "translation_job_not_found",
    "job_not_found",
  ]);
  if (notFoundCodes.has(message)) {
    return notFoundResponse(c, message);
  }

  if (message === "sanity_api_key_unauthorized") {
    return forbiddenResponse(c, message);
  }

  const badRequestCodes = new Set([
    "sanity_no_text_segments",
    "sanity_document_not_collected",
    "sanity_source_ingest_timeout",
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

  sanityIntegrationLogger.warn("sanity integration request failed", {
    connectionId: c.var.sanityConnection.id,
    organizationId: c.var.sanityConnection.organizationId,
    errorCode: message,
  });

  return c.json({ error: "sanity_localize_failed" }, 500);
}

async function resolveConnectionAuth(connection: SanityConnectionVariables["sanityConnection"]) {
  const auth = await resolveTeamAccessForSanityConnection({
    organizationId: connection.organizationId,
    apiKeyId: connection.apiKeyId,
  });
  if (!auth) {
    throw new Error("sanity_api_key_unauthorized");
  }
  return auth;
}

export function createSanityIntegrationRoutes(options: CreateSanityIntegrationRoutesOptions = {}) {
  return new Hono<{ Variables: SanityConnectionVariables }>()
    .use("*", sanityCorsMiddleware)
    .get("/health", async (c) => {
      const sanityOauthConfigured = Boolean(env.SANITY_OAUTH_CLIENT_ID);
      return c.json(
        {
          ok: true,
          sanityOauthConfigured,
          ...(sanityOauthConfigured && env.SANITY_OAUTH_CLIENT_ID
            ? { sanityOauthClientId: env.SANITY_OAUTH_CLIENT_ID }
            : {}),
        },
        200,
      );
    })
    .get("/session", sanityConnectionAuthMiddleware, async (c) => {
      const connection = c.var.sanityConnection;
      await touchSanityConnectionUsage(connection.id);

      try {
        const session = await getSanityConnectionSession({
          organizationId: connection.organizationId,
          connectionId: connection.id,
        });
        return c.json({ session }, 200);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .post("/collect", sanityConnectionAuthMiddleware, validateCollectBody, async (c) => {
      const payload = c.req.valid("json");
      const connection = c.var.sanityConnection;
      await touchSanityConnectionUsage(connection.id);

      try {
        const auth = await resolveConnectionAuth(connection);
        const result = await collectSanityDocument({
          auth,
          apiKeyId: connection.apiKeyId,
          projectId: payload.projectId,
          sanityProjectId: payload.sanityProjectId,
          dataset: payload.dataset,
          documentId: payload.documentId,
          documentType: payload.documentType,
          documentTitle: payload.documentTitle,
          segments: payload.segments,
          fileStorageAdapter: options.fileStorageAdapter,
        });
        return c.json(result, 201);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .get("/locales", sanityConnectionAuthMiddleware, validateLocalesQuery, async (c) => {
      const query = c.req.valid("query");
      const connection = c.var.sanityConnection;
      await touchSanityConnectionUsage(connection.id);

      try {
        const auth = await resolveConnectionAuth(connection);
        const result = await listSanityDocumentLocaleStatuses({
          auth,
          projectId: query.projectId,
          sanityProjectId: query.sanityProjectId,
          documentIds: query.documentIds,
        });
        return c.json(result, 200);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .post("/jobs", sanityConnectionAuthMiddleware, validateCreateJobBody, async (c) => {
      if (!options.jobQueue) {
        return c.json({ error: "translation_job_queue_unavailable" }, 503);
      }

      const payload = c.req.valid("json");
      const connection = c.var.sanityConnection;
      await touchSanityConnectionUsage(connection.id);

      try {
        const auth = await resolveConnectionAuth(connection);
        const project = await getAccessibleSanityProject(auth, payload.projectId);
        if (!project) {
          throw new Error("sanity_project_not_found");
        }
        const sourceLocale = payload.sourceLocale?.trim() || project.sourceLocale?.trim() || "";
        const targetLocales = payload.targetLocales;
        const doc = payload.documents[0];
        if (!doc) {
          throw new Error("invalid_sanity_job_payload");
        }

        if (doc.segments && doc.segments.length > 0) {
          const result = await startSanityLocalization({
            auth,
            apiKeyId: connection.apiKeyId,
            projectId: payload.projectId,
            sanityProjectId: doc.sanityProjectId,
            dataset: doc.dataset,
            documentId: doc.documentId,
            documentType: doc.documentType,
            documentTitle: doc.documentTitle,
            sourceLocale,
            targetLocales,
            segments: doc.segments,
            generate: payload.generate,
            jobQueue: options.jobQueue,
            fileStorageAdapter: options.fileStorageAdapter,
          });
          return c.json({ job: result }, 201);
        }

        const result = await generateSanityLocaleJobs({
          auth,
          projectId: payload.projectId,
          sanityProjectId: doc.sanityProjectId,
          dataset: doc.dataset,
          documentId: doc.documentId,
          documentType: doc.documentType,
          documentTitle: doc.documentTitle,
          sourceLocale,
          targetLocales,
          jobQueue: options.jobQueue,
        });
        return c.json({ job: result }, 201);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .get("/jobs/current", sanityConnectionAuthMiddleware, validateCurrentJobQuery, async (c) => {
      const query = c.req.valid("query");
      const connection = c.var.sanityConnection;
      await touchSanityConnectionUsage(connection.id);

      try {
        const auth = await resolveConnectionAuth(connection);
        const result = await getCurrentSanityDocumentJob({
          auth,
          sanityProjectId: query.sanityProjectId,
          dataset: query.dataset,
          documentId: query.documentId,
          documentType: query.documentType,
          projectId: query.projectId,
        });
        return c.json(result, 200);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .get("/jobs/:jobId", sanityConnectionAuthMiddleware, validateJobIdParams, async (c) => {
      const { jobId } = c.req.valid("param");
      const connection = c.var.sanityConnection;
      await touchSanityConnectionUsage(connection.id);

      try {
        const auth = await resolveConnectionAuth(connection);
        const status = await getSanityLocalizationStatus({
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
      sanityConnectionAuthMiddleware,
      validateJobIdParams,
      async (c) => {
        if (!options.jobQueue) {
          return c.json({ error: "translation_job_queue_unavailable" }, 503);
        }

        const { jobId } = c.req.valid("param");
        const connection = c.var.sanityConnection;
        await touchSanityConnectionUsage(connection.id);

        try {
          const auth = await resolveConnectionAuth(connection);
          const result = await generateSanityLocalization({
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
    .post("/apply-plan", sanityConnectionAuthMiddleware, validateApplyPlanBody, async (c) => {
      const payload = c.req.valid("json");
      const connection = c.var.sanityConnection;
      await touchSanityConnectionUsage(connection.id);

      try {
        const auth = await resolveConnectionAuth(connection);
        const plan = await buildSanityPluginApplyPlan({
          auth,
          projectId: payload.projectId,
          sourcePath: payload.sourcePath,
          document: payload.document as SanityDocumentRecord,
          i18nMode: payload.i18nMode,
          sourceSanityLocale: payload.sourceSanityLocale,
          targetSanityLocale: payload.targetSanityLocale,
        });
        return c.json({ plan }, 200);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .get("/translations", sanityConnectionAuthMiddleware, validatePullQuery, async (c) => {
      const query = c.req.valid("query");
      const connection = c.var.sanityConnection;
      await touchSanityConnectionUsage(connection.id);

      try {
        const auth = await resolveConnectionAuth(connection);
        const pullResult = await pullSanityDocumentLocaleContent({
          auth,
          projectId: query.projectId,
          sanityProjectId: query.sanityProjectId,
          dataset: query.dataset,
          documentId: query.documentId,
          documentType: query.documentType,
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
