import { Hono } from "hono";
import { validator } from "hono/validator";

import {
  canvaOAuthAuthMiddleware,
  type CanvaIntegrationVariables,
} from "@/api/auth/canva-integration-auth";
import { canvaCorsMiddleware } from "@/api/auth/canva-cors";
import { createCanvaJwtMiddleware } from "@/api/auth/canva-jwt";
import { badRequestResponse, forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import { resolveCanvaDesignId } from "@/lib/canva/auth";
import { getCanvaLocalizationStatus, startCanvaLocalization } from "@/lib/canva/localize-design";
import {
  getCanvaBrandOrgBinding,
  listCanvaUserOrganizations,
  listCanvaUserProjects,
  touchCanvaOAuthBrand,
  upsertCanvaBrandOrgBinding,
} from "@/lib/canva/user-resources";
import type { FileStorageAdapter } from "@/lib/file-storage";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";
import { env } from "@/lib/env";

import {
  canvaOrganizationIdQuerySchema,
  canvaProjectsQuerySchema,
  localizeCanvaDesignBodySchema,
  localizeCanvaJobIdParamSchema,
} from "./canva-integration.schema";

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

const validateOrganizationQuery = validator("query", (value, c) => {
  const parsed = canvaOrganizationIdQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_canva_organization_id", "Organization id is invalid.");
  }
  return parsed.data;
});

const validateProjectsQuery = validator("query", (value, c) => {
  const parsed = canvaProjectsQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_canva_organization_id", "Organization id is invalid.");
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
  return new Hono<{ Variables: CanvaIntegrationVariables }>()
    .use("*", canvaCorsMiddleware)
    .get("/health", createCanvaJwtMiddleware(), async (c) => {
      return c.json(
        {
          ok: true,
          canvaConfigured: Boolean(env.CANVA_APP_ID),
          oauthConfigured: Boolean(env.CANVA_OAUTH_CLIENT_ID && env.CANVA_OAUTH_CLIENT_SECRET),
          authenticated: Boolean(c.var.canvaUser),
        },
        200,
      );
    })
    .get("/me", canvaOAuthAuthMiddleware, async (c) => {
      const session = c.var.canvaOAuth!;
      const organizations = await listCanvaUserOrganizations(session.user.localUserId);
      const brandBinding = c.var.canvaUser
        ? await getCanvaBrandOrgBinding(c.var.canvaUser.brandId)
        : null;

      return c.json(
        {
          user: {
            id: session.user.localUserId,
            email: session.user.email,
          },
          organizations,
          brandBinding: brandBinding
            ? {
                organizationId: brandBinding.organizationId,
                organizationName: brandBinding.organizationName,
                organizationSlug: brandBinding.organizationSlug,
              }
            : null,
        },
        200,
      );
    })
    .get("/projects", canvaOAuthAuthMiddleware, validateProjectsQuery, async (c) => {
      const { organizationId } = c.req.valid("query");
      const session = c.var.canvaOAuth!;

      const projects = await listCanvaUserProjects({
        session,
        organizationId,
      });

      if (!projects) {
        return notFoundResponse(c, "canva_organization_not_found", "Workspace was not found.");
      }

      return c.json({ projects }, 200);
    })
    .post(
      "/localize",
      canvaOAuthAuthMiddleware,
      createCanvaJwtMiddleware({ required: true }),
      validateLocalizeBody,
      async (c) => {
        const payload = c.req.valid("json");
        const session = c.var.canvaOAuth!;
        const canvaUser = c.var.canvaUser!;

        if (session.canvaBrandId && session.canvaBrandId !== canvaUser.brandId) {
          return forbiddenResponse(
            c,
            "canva_brand_mismatch",
            "This Hyperlocalise session is linked to a different Canva team.",
          );
        }

        if (!session.canvaBrandId) {
          await touchCanvaOAuthBrand({
            sessionId: session.sessionId,
            canvaBrandId: canvaUser.brandId,
          });
        }

        if (payload.rememberBrandOrgBinding) {
          await upsertCanvaBrandOrgBinding({
            canvaBrandId: canvaUser.brandId,
            organizationId: payload.organizationId,
            userId: session.user.localUserId,
          });
        }

        try {
          const designId = await resolveCanvaDesignId(payload.designToken, env.CANVA_APP_ID);
          const result = await startCanvaLocalization({
            session,
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            sourceLocale: payload.sourceLocale,
            targetLocales: payload.targetLocales,
            designId,
            segments: payload.segments,
            canvaBrandId: canvaUser.brandId,
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
      canvaOAuthAuthMiddleware,
      validateLocalizeJobIdParams,
      validateOrganizationQuery,
      async (c) => {
        const { jobId } = c.req.valid("param");
        const { organizationId } = c.req.valid("query");
        const projectId = c.req.query("projectId");
        const session = c.var.canvaOAuth!;

        if (!projectId) {
          return badRequestResponse(c, "invalid_canva_project_id", "Project id is required.");
        }

        try {
          const status = await getCanvaLocalizationStatus({
            jobId,
            organizationId,
            userId: session.user.localUserId,
            projectId,
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
