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
import { createWorkspaceFeatureFlagMiddleware } from "@/api/middleware/workspace-feature-flag";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  serviceUnavailableResponse,
} from "@/api/response.schema";
import { workspaceDomainsFlag } from "@/lib/flags/workspace-flags";
import {
  expandLiveDomainKeywords,
  getLiveDomainResearchCatalog,
  inspectLiveDomainSerp,
  refreshLiveDomainRanks,
  saveLiveDomainKeywords,
  trackLiveDomainKeywords,
  type DomainResearchStoreError,
} from "@/lib/domains/research-store";
import { isErr } from "@/lib/primitives/result/results";

import { linkedDomainIdParamSchema } from "../linked-domain/linked-domain.schema";
import {
  expandDomainResearchBodySchema,
  inspectDomainResearchSerpBodySchema,
  saveDomainResearchKeywordsBodySchema,
  trackDomainResearchKeywordsBodySchema,
} from "./domain-research.schema";

const validateLinkedDomainParams = validator("param", (value, c) => {
  const parsed = linkedDomainIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_linked_domain_id");
  }
  return parsed.data;
});

function canReadLinkedDomains(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "projects:read");
}

function canWriteLinkedDomains(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "projects:create");
}

const requireWorkspaceDomainsFeature = createWorkspaceFeatureFlagMiddleware(
  workspaceDomainsFlag,
  "Workspace domains is not enabled for this organization",
);

function mapResearchError(
  c: Parameters<typeof badRequestResponse>[0],
  error: DomainResearchStoreError,
) {
  switch (error.code) {
    case "linked_domain_not_found":
      return notFoundResponse(c, error.code, error.message);
    case "provider_not_configured":
    case "provider_unavailable":
      return serviceUnavailableResponse(c, error.code, error.message);
    case "provider_rate_limited":
      return c.json({ error: error.code, message: error.message }, 429);
    default:
      return badRequestResponse(c, error.code, error.message);
  }
}

export function createDomainResearchRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .use("*", requireWorkspaceDomainsFeature)
    .get("/", validateLinkedDomainParams, async (c) => {
      if (!canReadLinkedDomains(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { linkedDomainId } = c.req.valid("param");
      const result = await getLiveDomainResearchCatalog({
        organizationId: c.var.auth.organization.localOrganizationId,
        linkedDomainId,
      });
      if (isErr(result)) {
        return mapResearchError(c, result.error);
      }

      return c.json(
        { catalog: result.value.catalog, linkedDomain: result.value.linkedDomain },
        200,
      );
    })
    .post(
      "/keywords/expand",
      validateLinkedDomainParams,
      validator("json", (value, c) => {
        const parsed = expandDomainResearchBodySchema.safeParse(value);
        if (!parsed.success) {
          return badRequestResponse(
            c,
            "invalid_domain_research_payload",
            "Seed keyword and market are required.",
            parsed.error.flatten(),
          );
        }
        return parsed.data;
      }),
      async (c) => {
        if (!canWriteLinkedDomains(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const { linkedDomainId } = c.req.valid("param");
        const body = c.req.valid("json");
        const result = await expandLiveDomainKeywords({
          organizationId: c.var.auth.organization.localOrganizationId,
          linkedDomainId,
          seedKeyword: body.seedKeyword,
          marketId: body.marketId,
          cookie: c.req.header("cookie"),
          signal: c.req.raw.signal,
        });
        if (isErr(result)) {
          return mapResearchError(c, result.error);
        }

        return c.json({ ideas: result.value.ideas, marketId: result.value.marketId }, 200);
      },
    )
    .post(
      "/keywords/save",
      validateLinkedDomainParams,
      validator("json", (value, c) => {
        const parsed = saveDomainResearchKeywordsBodySchema.safeParse(value);
        if (!parsed.success) {
          return badRequestResponse(
            c,
            "invalid_domain_research_payload",
            "Keywords to save are invalid.",
            parsed.error.flatten(),
          );
        }
        return parsed.data;
      }),
      async (c) => {
        if (!canWriteLinkedDomains(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const { linkedDomainId } = c.req.valid("param");
        const body = c.req.valid("json");
        const result = await saveLiveDomainKeywords({
          organizationId: c.var.auth.organization.localOrganizationId,
          linkedDomainId,
          marketId: body.marketId,
          seedKeyword: body.seedKeyword,
          keywords: body.keywords,
        });
        if (isErr(result)) {
          return mapResearchError(c, result.error);
        }

        return c.json({ keywords: result.value.keywords }, 200);
      },
    )
    .post(
      "/serp",
      validateLinkedDomainParams,
      validator("json", (value, c) => {
        const parsed = inspectDomainResearchSerpBodySchema.safeParse(value);
        if (!parsed.success) {
          return badRequestResponse(
            c,
            "invalid_domain_research_payload",
            "Keyword and market are required.",
            parsed.error.flatten(),
          );
        }
        return parsed.data;
      }),
      async (c) => {
        if (!canReadLinkedDomains(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const { linkedDomainId } = c.req.valid("param");
        const body = c.req.valid("json");
        const result = await inspectLiveDomainSerp({
          organizationId: c.var.auth.organization.localOrganizationId,
          linkedDomainId,
          keyword: body.keyword,
          marketId: body.marketId,
          cookie: c.req.header("cookie"),
          signal: c.req.raw.signal,
        });
        if (isErr(result)) {
          return mapResearchError(c, result.error);
        }

        return c.json({ results: result.value.results }, 200);
      },
    )
    .post(
      "/ranks",
      validateLinkedDomainParams,
      validator("json", (value, c) => {
        const parsed = trackDomainResearchKeywordsBodySchema.safeParse(value);
        if (!parsed.success) {
          return badRequestResponse(
            c,
            "invalid_domain_research_payload",
            "Keywords to track are invalid.",
            parsed.error.flatten(),
          );
        }
        return parsed.data;
      }),
      async (c) => {
        if (!canWriteLinkedDomains(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const { linkedDomainId } = c.req.valid("param");
        const body = c.req.valid("json");
        const result = await trackLiveDomainKeywords({
          organizationId: c.var.auth.organization.localOrganizationId,
          linkedDomainId,
          marketId: body.marketId,
          keywords: body.keywords,
          cookie: c.req.header("cookie"),
          signal: c.req.raw.signal,
        });
        if (isErr(result)) {
          return mapResearchError(c, result.error);
        }

        return c.json({ ranks: result.value.ranks }, 200);
      },
    )
    .post("/ranks/refresh", validateLinkedDomainParams, async (c) => {
      if (!canWriteLinkedDomains(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { linkedDomainId } = c.req.valid("param");
      const result = await refreshLiveDomainRanks({
        organizationId: c.var.auth.organization.localOrganizationId,
        linkedDomainId,
        cookie: c.req.header("cookie"),
        signal: c.req.raw.signal,
      });
      if (isErr(result)) {
        return mapResearchError(c, result.error);
      }

      return c.json({ ranks: result.value.ranks }, 200);
    });
}
