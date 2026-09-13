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
import { getLinkedDomain } from "@/lib/linked-domains/claims";
import { workspaceDomainsFlag } from "@/lib/flags/workspace-flags";
import { GSC_DEFAULT_DATE_RANGE, isGscDateRange } from "@/lib/gsc/constants";
import { mintGscAccessToken } from "@/lib/gsc/connections";
import { matchSearchConsoleSite } from "@/lib/gsc/match-site";
import { loadSearchConsolePerformance } from "@/lib/gsc/performance-loader";
import { getGscProvider } from "@/lib/gsc/provider";
import { isErr } from "@/lib/primitives/result/results";

import { linkedDomainIdParamSchema } from "../linked-domain/linked-domain.schema";
import {
  inspectSearchConsoleBodySchema,
  searchConsoleQuerySchema,
} from "./domain-search-console.schema";

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

const requireWorkspaceDomainsFeature = createWorkspaceFeatureFlagMiddleware(
  workspaceDomainsFlag,
  "Workspace domains is not enabled for this organization",
);

function mapGscError(
  c: Parameters<typeof badRequestResponse>[0],
  error: { code: string; message: string },
) {
  switch (error.code) {
    case "gsc_not_configured":
    case "provider_unavailable":
    case "gsc_upstream_unavailable":
      return serviceUnavailableResponse(c, error.code, error.message);
    case "gsc_connection_not_found":
    case "gsc_not_found":
      return notFoundResponse(c, error.code, error.message);
    case "gsc_rate_limited":
      return c.json({ error: error.code, message: error.message }, 429);
    case "gsc_auth_failed":
      return c.json({ error: error.code, message: error.message }, 401);
    default:
      return badRequestResponse(c, error.code, error.message);
  }
}

export function createDomainSearchConsoleRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .use("*", requireWorkspaceDomainsFeature)
    .get(
      "/",
      validateLinkedDomainParams,
      validator("query", (value, c) => {
        const parsed = searchConsoleQuerySchema.safeParse(value);
        if (!parsed.success) {
          return badRequestResponse(c, "invalid_search_console_query");
        }
        return parsed.data;
      }),
      async (c) => {
        if (!canReadLinkedDomains(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const { linkedDomainId } = c.req.valid("param");
        const linkedDomain = await getLinkedDomain({
          organizationId: c.var.auth.organization.localOrganizationId,
          linkedDomainId,
        });
        if (!linkedDomain) {
          return notFoundResponse(c, "linked_domain_not_found");
        }

        const query = c.req.valid("query");
        const result = await loadSearchConsolePerformance({
          organizationId: c.var.auth.organization.localOrganizationId,
          domainKey: linkedDomain.domainKey,
          dateRange:
            query.dateRange && isGscDateRange(query.dateRange)
              ? query.dateRange
              : GSC_DEFAULT_DATE_RANGE,
          marketId: query.locale,
          cookie: c.req.header("cookie") ?? undefined,
        });
        if (isErr(result)) {
          return mapGscError(c, result.error);
        }

        return c.json({ searchConsole: result.value, linkedDomain }, 200);
      },
    )
    .post(
      "/inspect",
      validateLinkedDomainParams,
      validator("json", (value, c) => {
        const parsed = inspectSearchConsoleBodySchema.safeParse(value);
        if (!parsed.success) {
          return badRequestResponse(
            c,
            "invalid_search_console_inspect_payload",
            "A valid URL is required.",
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
        const linkedDomain = await getLinkedDomain({
          organizationId: c.var.auth.organization.localOrganizationId,
          linkedDomainId,
        });
        if (!linkedDomain) {
          return notFoundResponse(c, "linked_domain_not_found");
        }

        const minted = await mintGscAccessToken({
          organizationId: c.var.auth.organization.localOrganizationId,
        });
        if (isErr(minted)) {
          return mapGscError(c, minted.error);
        }

        const sites = await getGscProvider().listSites({
          accessToken: minted.value.accessToken,
          cookie: c.req.header("cookie") ?? undefined,
        });
        if (isErr(sites)) {
          return mapGscError(c, sites.error);
        }

        const site = matchSearchConsoleSite(sites.value, linkedDomain.domainKey);
        if (!site) {
          return notFoundResponse(
            c,
            "gsc_property_not_found",
            "This domain is not a verified Search Console property on the connected account.",
          );
        }

        const inspection = await getGscProvider().inspectUrl({
          accessToken: minted.value.accessToken,
          siteUrl: site.siteUrl,
          inspectionUrl: c.req.valid("json").url,
          cookie: c.req.header("cookie") ?? undefined,
        });
        if (isErr(inspection)) {
          return mapGscError(c, inspection.error);
        }

        return c.json({ inspection: inspection.value, siteUrl: site.siteUrl }, 200);
      },
    );
}
