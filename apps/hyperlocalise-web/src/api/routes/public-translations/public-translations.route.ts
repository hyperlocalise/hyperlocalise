import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { validator } from "hono/validator";

import {
  apiKeyAuthMiddleware,
  requireApiKeyPermission,
  type ApiKeyAuthVariables,
} from "@/api/auth/api-key";
import { getAccessibleProjectForApiKey } from "@/api/auth/api-key-access";
import { payloadTooLargeResponse } from "@/api/response.schema";
import { projectTranslationService } from "@/lib/projects/translations/project-translation-service";

import {
  listPublicTranslationsQuerySchema,
  publicTranslationProjectParamsSchema,
  upsertPublicTranslationsBodySchema,
} from "./public-translations.schema";
import {
  invalidTranslationPayloadResponse,
  projectNotFoundResponse,
} from "./public-translations.shared";

const validateProjectParams = validator("param", (value, c) => {
  const parsed = publicTranslationProjectParamsSchema.safeParse(value);
  if (!parsed.success) {
    return projectNotFoundResponse(c);
  }
  return parsed.data;
});

const validateListQuery = validator("query", (value, c) => {
  const parsed = listPublicTranslationsQuerySchema.safeParse(value);
  if (!parsed.success) {
    return invalidTranslationPayloadResponse(c);
  }
  return parsed.data;
});

const validateUpsertBody = validator("json", (value, c) => {
  const parsed = upsertPublicTranslationsBodySchema.safeParse(value);
  if (!parsed.success) {
    return invalidTranslationPayloadResponse(c);
  }
  return parsed.data;
});

function parseLocales(value: string | undefined) {
  if (!value?.trim()) {
    return undefined;
  }

  return value
    .split(",")
    .map((locale) => locale.trim())
    .filter(Boolean);
}

export function createPublicTranslationRoutes() {
  return new Hono<{ Variables: ApiKeyAuthVariables }>()
    .use("*", apiKeyAuthMiddleware)
    .get(
      "/:projectId/translations",
      requireApiKeyPermission("files:read"),
      validateProjectParams,
      validateListQuery,
      async (c) => {
        const params = c.req.valid("param");
        const query = c.req.valid("query");
        const organizationId = c.var.auth.organization.localOrganizationId;

        const project = await getAccessibleProjectForApiKey(
          c.var.auth.teamAccess,
          params.projectId,
        );
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const result = await projectTranslationService.listTranslationsForSync({
          organizationId,
          projectId: project.id,
          sourcePath: query.sourcePath,
          locales: parseLocales(query.locales),
        });

        return c.json(
          {
            translations: result.entries,
            revision: result.revision,
          },
          200,
        );
      },
    )
    .put(
      "/:projectId/translations",
      requireApiKeyPermission("files:write"),
      bodyLimit({
        maxSize: 5 * 1024 * 1024,
        onError: (c) => payloadTooLargeResponse(c, "translation_payload_too_large"),
      }),
      validateProjectParams,
      validateUpsertBody,
      async (c) => {
        const params = c.req.valid("param");
        const body = c.req.valid("json");
        const organizationId = c.var.auth.organization.localOrganizationId;

        const project = await getAccessibleProjectForApiKey(
          c.var.auth.teamAccess,
          params.projectId,
        );
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const result = await projectTranslationService.upsertTranslationsFromSync({
          organizationId,
          projectId: project.id,
          sourcePath: body.sourcePath,
          sourceLocale: body.sourceLocale,
          entries: body.entries,
        });

        return c.json({ result }, 200);
      },
    );
}
