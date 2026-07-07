import { Hono } from "hono";
import path from "node:path";
import { validator } from "hono/validator";

import {
  apiKeyAuthMiddleware,
  requireApiKeyPermission,
  type ApiKeyAuthVariables,
} from "@/api/auth/api-key";
import { getAccessibleProjectForApiKey } from "@/api/auth/api-key-access";
import {
  getRepositorySourceFileByPath,
  loadProjectTranslationsAsPrefilledEntries,
} from "@/lib/projects/translations/project-translation-service";

import {
  downloadPublicTranslationsQuerySchema,
  publicTranslationProjectParamsSchema,
} from "./public-translations.schema";
import {
  invalidTranslationPayloadResponse,
  projectNotFoundResponse,
  sourceFileNotFoundResponse,
  sourceFileTooLargeResponse,
  translationsNotFoundResponse,
} from "./public-translations.shared";

const validateProjectParams = validator("param", (value, c) => {
  const parsed = publicTranslationProjectParamsSchema.safeParse(value);
  if (!parsed.success) {
    return projectNotFoundResponse(c);
  }
  return parsed.data;
});

const validateDownloadQuery = validator("query", (value, c) => {
  const parsed = downloadPublicTranslationsQuerySchema.safeParse(value);
  if (!parsed.success) {
    return invalidTranslationPayloadResponse(c);
  }
  return parsed.data;
});

function downloadFilename(sourcePath: string, locale: string) {
  const extension = path.extname(sourcePath);
  const baseName = path.basename(sourcePath, extension);
  const suffix = baseName.endsWith(`-${locale}`) ? baseName : `${baseName}-${locale}`;
  return extension ? `${suffix}${extension}` : `${suffix}.json`;
}

export function createPublicTranslationRoutes() {
  return new Hono<{ Variables: ApiKeyAuthVariables }>()
    .use("*", apiKeyAuthMiddleware)
    .get(
      "/:projectId/translations/download",
      requireApiKeyPermission("files:read"),
      validateProjectParams,
      validateDownloadQuery,
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

        const sourceFile = await getRepositorySourceFileByPath({
          organizationId,
          projectId: project.id,
          sourcePath: query.sourcePath,
        });
        if (!sourceFile) {
          return sourceFileNotFoundResponse(c);
        }

        const result = await loadProjectTranslationsAsPrefilledEntries({
          organizationId,
          projectId: project.id,
          sourcePath: query.sourcePath,
          targetLocale: query.locale,
          includeAllSourceKeys: true,
        });

        if (result.truncated) {
          return sourceFileTooLargeResponse(c, result.maxKeyCount);
        }

        if (result.loadedKeyCount === 0) {
          return translationsNotFoundResponse(c);
        }

        const content = JSON.stringify(result.prefilled, null, 2) + "\n";
        const filename = downloadFilename(query.sourcePath, query.locale);

        return c.body(content, 200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        });
      },
    );
}
