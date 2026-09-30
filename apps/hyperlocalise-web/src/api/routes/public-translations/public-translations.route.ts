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
import path from "node:path";
import { validator } from "hono/validator";

import { requireApiKeyPermission, type ApiKeyAuthVariables } from "@/api/auth/api-key";
import { getAccessibleProjectForApiKey } from "@/api/auth/api-key-access";
import { publicApiAuthMiddleware } from "@/api/auth/workos-agent";
import { internalErrorResponse } from "@/api/response.schema";
import { loadProjectLottieTranslationDownload } from "@/lib/projects/files/lottie-translation-download";
import {
  getRepositorySourceFileByPath,
  loadProjectTranslationsAsPrefilledEntries,
} from "@/lib/projects/translations/project-translation-service";
import { isErr } from "@/lib/primitives/result/results";

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
    .use("*", publicApiAuthMiddleware)
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

        const filename = downloadFilename(query.sourcePath, query.locale);
        const contentDisposition = `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;

        const lottieDownload = await loadProjectLottieTranslationDownload({
          organizationId,
          projectId: project.id,
          sourcePath: query.sourcePath,
          prefilled: result.prefilled,
        });
        if (isErr(lottieDownload)) {
          return internalErrorResponse(
            c,
            "lottie_export_failed",
            "Could not write translations into the Lottie animation.",
          );
        }
        if (lottieDownload.value) {
          return c.body(new Uint8Array(lottieDownload.value.content), 200, {
            "Content-Type": lottieDownload.value.contentType,
            "Content-Disposition": contentDisposition,
          });
        }

        const content = JSON.stringify(result.prefilled, null, 2) + "\n";

        return c.body(content, 200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": contentDisposition,
        });
      },
    );
}
