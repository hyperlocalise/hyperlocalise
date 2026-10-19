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

import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  badRequestResponse,
  forbiddenResponse,
  serviceUnavailableResponse,
  unauthorizedResponse,
  type JsonContext,
} from "@/api/response.schema";
import { createSanityClient } from "@/lib/sanity/client";
import {
  detectSanityDocumentTypes,
  isSanityAuthError,
  listSanityDatasets,
  listSanityLocaleCatalog,
  listSanityManageProjects,
  SanityApiError,
} from "@/lib/sanity/content-api";
import { normalizeSanityLocaleCatalogConfig } from "@/lib/sanity/locale-catalog";
import type { SanityLocaleCatalogConfig } from "@/lib/sanity/types";
import { isSanityHelperDocumentType } from "@/lib/sanity/localization-mode";
import { loadSanityPipesAccessToken, saveSanityPipesApiToken } from "@/lib/sanity/pipes";
import type { SanityPipesError } from "@/lib/sanity/types";
import { isErr, type Result } from "@/lib/primitives/result/results";

import {
  sanityDatasetParamsSchema,
  sanityDocumentTypesQuerySchema,
  sanityLocaleCatalogQuerySchema,
  sanityProjectIdParamSchema,
  upsertSanityConnectionBodySchema,
} from "./sanity.schema";

const validateProjectParams = validator("param", (value, c) => {
  const parsed = sanityProjectIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_sanity_project_id", "Sanity project id is invalid.");
  }
  return parsed.data;
});

const validateDatasetParams = validator("param", (value, c) => {
  const parsed = sanityDatasetParamsSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_sanity_dataset", "Sanity dataset is invalid.");
  }
  return parsed.data;
});

const validateDocumentTypesQuery = validator("query", (value, c) => {
  const parsed = sanityDocumentTypesQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_sanity_document_types",
      "Document type query is invalid.",
    );
  }
  return parsed.data;
});

const validateLocaleCatalogQuery = validator("query", (value, c) => {
  const parsed = sanityLocaleCatalogQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_sanity_locale_catalog",
      "Locale catalog query is invalid.",
    );
  }
  return parsed.data;
});

function localeCatalogConfigFromQuery(query: {
  localeType?: string;
  tagField?: string;
  titleField?: string;
}): SanityLocaleCatalogConfig {
  return normalizeSanityLocaleCatalogConfig({
    documentType: query.localeType,
    tagField: query.tagField,
    titleField: query.titleField,
  });
}

function canReadIntegrations(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteIntegrations(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:write");
}

const validateUpsertConnectionBody = validator("json", (value, c) => {
  const parsed = upsertSanityConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "sanity_api_token_required",
      "Paste a Sanity API token with Editor access or higher.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

function mapSanitySetupError(c: JsonContext, error: SanityPipesError) {
  if (error.code === "sanity_api_token_required") {
    return badRequestResponse(c, error.code, error.message);
  }
  if (
    error.code === "sanity_pipes_unavailable" ||
    error.code === "sanity_not_connected" ||
    error.code === "sanity_pipes_needs_reauthorization"
  ) {
    return serviceUnavailableResponse(c, error.code, error.message);
  }
  return badRequestResponse(c, error.code, error.message);
}

function mapSanityProviderError(c: JsonContext, error: object) {
  if (error instanceof SanityApiError) {
    if (error.status === 401 || error.status === 403) {
      return unauthorizedResponse(
        c,
        "sanity_unauthorized",
        "Sanity rejected this access token for the connected workspace.",
      );
    }
  }
  if (isSanityAuthError(error)) {
    return unauthorizedResponse(
      c,
      "sanity_unauthorized",
      "Sanity rejected this access token for the connected workspace.",
    );
  }
  return null;
}

async function loadSanityManageToken(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, SanityPipesError>> {
  return loadSanityPipesAccessToken({
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
}

export function createSanityRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .put("/", validateUpsertConnectionBody, async (c) => {
      if (!canWriteIntegrations(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { apiToken } = c.req.valid("json");
      const result = await saveSanityPipesApiToken({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
        workosOrganizationId: c.var.auth.organization.workosOrganizationId,
        apiToken,
      });
      if (isErr(result)) {
        return mapSanitySetupError(c, result.error);
      }

      return c.json({ sanity: result.value }, 200);
    })
    .get("/projects", async (c) => {
      if (!canReadIntegrations(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const tokenResult = await loadSanityManageToken({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });
      if (isErr(tokenResult)) {
        return mapSanitySetupError(c, tokenResult.error);
      }

      try {
        const projects = await listSanityManageProjects(tokenResult.value);
        return c.json({ projects }, 200);
      } catch (error) {
        if (typeof error === "object" && error !== null) {
          const mapped = mapSanityProviderError(c, error);
          if (mapped) {
            return mapped;
          }
        }
        throw error;
      }
    })
    .get("/projects/:projectId/datasets", validateProjectParams, async (c) => {
      if (!canReadIntegrations(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { projectId } = c.req.valid("param");
      const tokenResult = await loadSanityManageToken({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });
      if (isErr(tokenResult)) {
        return mapSanitySetupError(c, tokenResult.error);
      }

      try {
        const datasets = await listSanityDatasets(tokenResult.value, projectId);
        return c.json({ datasets }, 200);
      } catch (error) {
        if (typeof error === "object" && error !== null) {
          const mapped = mapSanityProviderError(c, error);
          if (mapped) {
            return mapped;
          }
        }
        throw error;
      }
    })
    .get("/projects/:projectId/datasets/:dataset/types", validateDatasetParams, async (c) => {
      if (!canReadIntegrations(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { projectId, dataset } = c.req.valid("param");
      const tokenResult = await loadSanityManageToken({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });
      if (isErr(tokenResult)) {
        return mapSanitySetupError(c, tokenResult.error);
      }

      const client = createSanityClient({
        token: tokenResult.value,
        projectId,
        dataset,
      });

      try {
        const typeNames = await client.fetch<string[]>(
          `array::unique(*[defined(_type) && !(_id in path("drafts.**"))]._type)`,
        );
        return c.json(
          {
            typeNames: typeNames.filter(
              (name): name is string =>
                typeof name === "string" &&
                name.trim().length > 0 &&
                !isSanityHelperDocumentType(name),
            ),
          },
          200,
        );
      } catch (error) {
        if (typeof error === "object" && error !== null) {
          const mapped = mapSanityProviderError(c, error);
          if (mapped) {
            return mapped;
          }
        }
        throw error;
      }
    })
    .get(
      "/projects/:projectId/datasets/:dataset/locales",
      validateDatasetParams,
      validateLocaleCatalogQuery,
      async (c) => {
        if (!canReadIntegrations(c.var.auth.membership.role)) {
          return forbiddenResponse(c, "forbidden");
        }

        const { projectId, dataset } = c.req.valid("param");
        const catalogQuery = c.req.valid("query");
        const tokenResult = await loadSanityManageToken({
          localOrganizationId: c.var.auth.organization.localOrganizationId,
          workosUserId: c.var.auth.user.workosUserId,
        });
        if (isErr(tokenResult)) {
          return mapSanitySetupError(c, tokenResult.error);
        }

        const client = createSanityClient({
          token: tokenResult.value,
          projectId,
          dataset,
        });

        try {
          const localeCatalog = localeCatalogConfigFromQuery(catalogQuery);
          const locales = await listSanityLocaleCatalog(client, localeCatalog);
          return c.json(
            {
              locales,
              languages: locales.map((entry) => entry.tag),
              source: locales.length > 0 ? ("catalog" as const) : ("none" as const),
            },
            200,
          );
        } catch (error) {
          if (typeof error === "object" && error !== null) {
            const mapped = mapSanityProviderError(c, error);
            if (mapped) {
              return mapped;
            }
          }
          throw error;
        }
      },
    )
    .get(
      "/projects/:projectId/datasets/:dataset/document-types",
      validateDatasetParams,
      validateDocumentTypesQuery,
      async (c) => {
        if (!canReadIntegrations(c.var.auth.membership.role)) {
          return forbiddenResponse(c, "forbidden");
        }

        const { projectId, dataset } = c.req.valid("param");
        const { typeNames, sourceLocale, localeType, tagField, titleField } = c.req.valid("query");
        const tokenResult = await loadSanityManageToken({
          localOrganizationId: c.var.auth.organization.localOrganizationId,
          workosUserId: c.var.auth.user.workosUserId,
        });
        if (isErr(tokenResult)) {
          return mapSanitySetupError(c, tokenResult.error);
        }

        const client = createSanityClient({
          token: tokenResult.value,
          projectId,
          dataset,
        });

        try {
          const detected = await detectSanityDocumentTypes({
            client,
            typeNames,
            localeCatalog: localeCatalogConfigFromQuery({ localeType, tagField, titleField }),
            sourceLocale,
          });
          return c.json(
            {
              types: detected.types,
              languages: detected.languages,
              localeSource: detected.localeSource,
              ...(detected.unsupportedSourceTypes
                ? { unsupportedSourceTypes: detected.unsupportedSourceTypes }
                : {}),
            },
            200,
          );
        } catch (error) {
          if (typeof error === "object" && error !== null) {
            const mapped = mapSanityProviderError(c, error);
            if (mapped) {
              return mapped;
            }
          }
          throw error;
        }
      },
    );
}
