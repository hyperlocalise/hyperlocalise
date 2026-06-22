import { Hono } from "hono";
import { validator } from "hono/validator";

import {
  canvaConnectionAuthMiddleware,
  type CanvaConnectionVariables,
} from "@/api/auth/canva-connection";
import { canvaCorsMiddleware } from "@/api/auth/canva-cors";
import { createCanvaJwtMiddleware } from "@/api/auth/canva-jwt";
import { badRequestResponse, forbiddenResponse } from "@/api/response.schema";
import { bindCanvaConnectionBrand, touchCanvaConnectionUsage } from "@/lib/canva/connections";
import { resolveCanvaDesignId } from "@/lib/canva/auth";
import { getCanvaLocalizationStatus, startCanvaLocalization } from "@/lib/canva/localize-design";
import type { FileStorageAdapter } from "@/lib/file-storage";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";
import { env } from "@/lib/env";

import {
  localizeCanvaDesignBodySchema,
  localizeCanvaJobIdParamSchema,
} from "../canva-connection/canva-connection.schema";

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

type CreateCanvaIntegrationRoutesOptions = {
  jobQueue?: JobQueue<TranslationJobEventData>;
  fileStorageAdapter?: FileStorageAdapter;
};

function localizeErrorResponse(c: Parameters<typeof badRequestResponse>[0], error: unknown) {
  const message = error instanceof Error ? error.message : "canva_localize_failed";
  return c.json(
    {
      error: "canva_localize_failed",
      message,
    },
    502,
  );
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
    .post(
      "/localize",
      canvaConnectionAuthMiddleware,
      createCanvaJwtMiddleware(),
      validateLocalizeBody,
      async (c) => {
        const payload = c.req.valid("json");
        const connection = c.var.canvaConnection;
        const canvaUser = c.var.canvaUser;

        let touchedUsage = false;
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
              touchedUsage = true;
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

        if (!touchedUsage) {
          await touchCanvaConnectionUsage(connection.id);
        }

        try {
          const designId = await resolveCanvaDesignId(payload.designToken, env.CANVA_APP_ID);
          const result = await startCanvaLocalization({
            organizationId: connection.organizationId,
            apiKeyId: connection.apiKeyId,
            projectId: payload.projectId ?? connection.projectId,
            sourceLocale: payload.sourceLocale ?? connection.sourceLocale,
            targetLocales: payload.targetLocales ?? connection.targetLocales,
            designId,
            segments: payload.segments,
            jobQueue: options.jobQueue,
            fileStorageAdapter: options.fileStorageAdapter,
          });

          return c.json(
            {
              ...result,
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
