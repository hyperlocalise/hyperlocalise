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
  canvaConnectionAuthMiddleware,
  type CanvaConnectionVariables,
} from "@/api/auth/canva-connection";
import { canvaCorsMiddleware } from "@/api/auth/canva-cors";
import { createCanvaJwtMiddleware } from "@/api/auth/canva-jwt";
import { badRequestResponse, forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import {
  bindCanvaConnectionBrand,
  getCanvaConnectionSession,
  touchCanvaConnectionUsage,
} from "@/lib/canva/connections";
import {
  createCanvaConnectionClaim,
  pollCanvaConnectionClaim,
} from "@/lib/canva/connection-claims";
import { resolveCanvaDesignId } from "@/lib/canva/auth";
import {
  generateCanvaLocalization,
  getCanvaLocalizationStatus,
  getCurrentCanvaDesignJob,
  pullLatestCanvaTranslations,
  startCanvaLocalization,
} from "@/lib/canva/localize-design";
import type { CanvaVerifiedUser } from "@/lib/canva/types";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";
import { env } from "@/lib/env";

import {
  canvaClaimIdParamSchema,
  createCanvaJobBodySchema,
  currentCanvaJobQuerySchema,
  localizeCanvaDesignBodySchema,
  localizeCanvaJobIdParamSchema,
  pullCanvaTranslationsQuerySchema,
} from "../canva-connection/canva-connection.schema";

const CLAIM_TOKEN_HEADER = "x-hyperlocalise-claim-token";

const validateLocalizeBody = validator("json", (value, c) => {
  const parsed = localizeCanvaDesignBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_canva_localize_payload",
      "Canva localize payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateCreateJobBody = validator("json", (value, c) => {
  const parsed = createCanvaJobBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_canva_job_payload",
      "Canva job payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateLocalizeJobIdParams = validator("param", (value, c) => {
  const parsed = localizeCanvaJobIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_canva_localize_job_id",
      "Canva localize job id is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateClaimIdParams = validator("param", (value, c) => {
  const parsed = canvaClaimIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_canva_claim_id", "Canva claim id is invalid.");
  }
  return parsed.data;
});

const validateCurrentJobQuery = validator("query", (value, c) => {
  const parsed = currentCanvaJobQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_canva_current_job_query",
      "Canva current job query is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validatePullQuery = validator("query", (value, c) => {
  const parsed = pullCanvaTranslationsQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_canva_translations_query",
      "Canva translations query is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

type CreateCanvaIntegrationRoutesOptions = {
  jobQueue?: JobQueue<TranslationJobEventData>;
  fileStorageAdapter?: FileStorageAdapter;
};

function localizeErrorResponse(c: Parameters<typeof badRequestResponse>[0], error: unknown) {
  const message = error instanceof Error ? error.message : "canva_localize_failed";
  const notFoundCodes = new Set([
    "canva_project_not_found",
    "canva_session_not_found",
    "translation_job_not_found",
    "job_not_found",
    "canva_claim_not_found",
  ]);
  if (notFoundCodes.has(message)) {
    return notFoundResponse(c, message);
  }

  const badRequestCodes = new Set([
    "canva_no_text_segments",
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
      error: "canva_localize_failed",
      message,
    },
    502,
  );
}

async function applyCanvaBrandBinding(
  c: Parameters<typeof forbiddenResponse>[0],
  connection: CanvaConnectionVariables["canvaConnection"],
  canvaUser: CanvaVerifiedUser | undefined,
) {
  if (canvaUser) {
    if (connection.canvaBrandId && connection.canvaBrandId !== canvaUser.brandId) {
      return forbiddenResponse(
        c,
        "canva_brand_mismatch",
        "This connection is linked to a different Canva brand.",
      );
    }

    if (!connection.canvaBrandId) {
      try {
        await bindCanvaConnectionBrand({
          connectionId: connection.id,
          organizationId: connection.organizationId,
          canvaBrandId: canvaUser.brandId,
        });
        return null;
      } catch (error) {
        if (error instanceof Error && error.message === "canva_brand_already_bound") {
          return forbiddenResponse(
            c,
            error.message,
            "This Canva brand is already linked to another connection.",
          );
        }
        throw error;
      }
    }
  }

  await touchCanvaConnectionUsage(connection.id);
  return null;
}

export function createCanvaIntegrationRoutes(options: CreateCanvaIntegrationRoutesOptions = {}) {
  return new Hono<{ Variables: CanvaConnectionVariables }>()
    .use("*", canvaCorsMiddleware)
    .get("/health", async (c) => {
      return c.json(
        {
          ok: true,
          canvaConfigured: Boolean(env.CANVA_APP_ID),
        },
        200,
      );
    })
    .post("/claims", async (c) => {
      try {
        const claim = await createCanvaConnectionClaim();
        return c.json(claim, 201);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .get("/claims/:claimId", validateClaimIdParams, async (c) => {
      const { claimId } = c.req.valid("param");
      const pollToken = c.req.header(CLAIM_TOKEN_HEADER)?.trim();
      if (!pollToken) {
        return badRequestResponse(
          c,
          "canva_claim_token_required",
          "Canva claim token is required.",
        );
      }

      try {
        const result = await pollCanvaConnectionClaim({ claimId, pollToken });
        return c.json(result, 200);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .get("/session", canvaConnectionAuthMiddleware, async (c) => {
      const connection = c.var.canvaConnection;
      try {
        const session = await getCanvaConnectionSession({
          organizationId: connection.organizationId,
          connectionId: connection.id,
          projectId: connection.projectId,
        });
        return c.json({ session }, 200);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .post(
      "/jobs",
      canvaConnectionAuthMiddleware,
      createCanvaJwtMiddleware({ required: true }),
      validateCreateJobBody,
      async (c) => {
        if (!options.jobQueue) {
          return c.json({ error: "translation_job_queue_unavailable" }, 503);
        }

        const payload = c.req.valid("json");
        const connection = c.var.canvaConnection;
        const brandError = await applyCanvaBrandBinding(c, connection, c.var.canvaUser);
        if (brandError) {
          return brandError;
        }

        try {
          const designId = await resolveCanvaDesignId(payload.designToken, env.CANVA_APP_ID);
          const result = await startCanvaLocalization({
            organizationId: connection.organizationId,
            apiKeyId: connection.apiKeyId,
            canvaConnectionId: connection.id,
            projectId: connection.projectId,
            sourceLocale: payload.sourceLocale ?? connection.sourceLocale,
            targetLocales: payload.targetLocales ?? connection.targetLocales,
            designId,
            segments: payload.segments,
            generate: payload.generate,
            jobQueue: options.jobQueue,
            fileStorageAdapter: options.fileStorageAdapter,
          });

          return c.json({ job: result }, 201);
        } catch (error) {
          return localizeErrorResponse(c, error);
        }
      },
    )
    .get("/jobs/current", canvaConnectionAuthMiddleware, validateCurrentJobQuery, async (c) => {
      const query = c.req.valid("query");
      const connection = c.var.canvaConnection;
      try {
        const designId =
          query.designId ?? (await resolveCanvaDesignId(query.designToken ?? "", env.CANVA_APP_ID));
        const result = await getCurrentCanvaDesignJob({
          organizationId: connection.organizationId,
          canvaConnectionId: connection.id,
          projectId: connection.projectId,
          apiKeyId: connection.apiKeyId,
          designId,
        });
        return c.json(result, 200);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .get("/jobs/:jobId", canvaConnectionAuthMiddleware, validateLocalizeJobIdParams, async (c) => {
      const { jobId } = c.req.valid("param");
      const connection = c.var.canvaConnection;
      try {
        const status = await getCanvaLocalizationStatus({
          jobId,
          organizationId: connection.organizationId,
          canvaConnectionId: connection.id,
          projectId: connection.projectId,
          apiKeyId: connection.apiKeyId,
        });
        return c.json({ job: status }, 200);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .post(
      "/jobs/:jobId/generate",
      canvaConnectionAuthMiddleware,
      validateLocalizeJobIdParams,
      async (c) => {
        if (!options.jobQueue) {
          return c.json({ error: "translation_job_queue_unavailable" }, 503);
        }

        const { jobId } = c.req.valid("param");
        const connection = c.var.canvaConnection;
        try {
          const result = await generateCanvaLocalization({
            organizationId: connection.organizationId,
            canvaConnectionId: connection.id,
            projectId: connection.projectId,
            apiKeyId: connection.apiKeyId,
            jobId,
            jobQueue: options.jobQueue,
          });
          return c.json({ job: { jobId: result.jobId, generated: true } }, 202);
        } catch (error) {
          return localizeErrorResponse(c, error);
        }
      },
    )
    .get("/translations", canvaConnectionAuthMiddleware, validatePullQuery, async (c) => {
      const query = c.req.valid("query");
      const connection = c.var.canvaConnection;
      try {
        const designId =
          query.designId ?? (await resolveCanvaDesignId(query.designToken ?? "", env.CANVA_APP_ID));
        const translations = await pullLatestCanvaTranslations({
          organizationId: connection.organizationId,
          canvaConnectionId: connection.id,
          projectId: connection.projectId,
          apiKeyId: connection.apiKeyId,
          designId,
        });
        return c.json({ translations }, 200);
      } catch (error) {
        return localizeErrorResponse(c, error);
      }
    })
    .post(
      "/localize",
      canvaConnectionAuthMiddleware,
      createCanvaJwtMiddleware({ required: true }),
      validateLocalizeBody,
      async (c) => {
        const payload = c.req.valid("json");
        const connection = c.var.canvaConnection;
        const brandError = await applyCanvaBrandBinding(c, connection, c.var.canvaUser);
        if (brandError) {
          return brandError;
        }

        try {
          const designId = await resolveCanvaDesignId(payload.designToken, env.CANVA_APP_ID);
          const result = await startCanvaLocalization({
            organizationId: connection.organizationId,
            apiKeyId: connection.apiKeyId,
            canvaConnectionId: connection.id,
            projectId: connection.projectId,
            sourceLocale: payload.sourceLocale ?? connection.sourceLocale,
            targetLocales: payload.targetLocales ?? connection.targetLocales,
            designId,
            segments: payload.segments,
            generate: Boolean(options.jobQueue),
            jobQueue: options.jobQueue,
            fileStorageAdapter: options.fileStorageAdapter,
          });

          return c.json(
            {
              jobId: result.jobId,
              mode: "hyperlocalise" as const,
            },
            202,
          );
        } catch (error) {
          return localizeErrorResponse(c, error);
        }
      },
    )
    .get(
      "/localize/:jobId",
      canvaConnectionAuthMiddleware,
      validateLocalizeJobIdParams,
      async (c) => {
        const { jobId } = c.req.valid("param");
        const connection = c.var.canvaConnection;

        try {
          const status = await getCanvaLocalizationStatus({
            jobId,
            organizationId: connection.organizationId,
            canvaConnectionId: connection.id,
            projectId: connection.projectId,
            apiKeyId: connection.apiKeyId,
          });

          return c.json(
            {
              ...status,
              mode: "hyperlocalise" as const,
            },
            200,
          );
        } catch (error) {
          return localizeErrorResponse(c, error);
        }
      },
    );
}
