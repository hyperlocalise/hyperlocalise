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
  conflictResponse,
  forbiddenResponse,
  notFoundResponse,
  serviceUnavailableResponse,
} from "@/api/response.schema";
import { LOCALISATION_AUDIT_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { workspaceDomainsFlag } from "@/lib/flags/workspace-flags";
import {
  cancelPendingLinkedDomainClaim,
  getLinkedDomain,
  getLinkedDomainAudit,
  listLinkedDomains,
  startDirectLinkedDomainClaim,
  startLinkedDomainClaim,
  updateLinkedDomainMarkets,
  updateLinkedDomainProject,
  verifyAndClaimLinkedDomain,
} from "@/lib/linked-domains/claims";
import { recommendDomainMarkets } from "@/lib/domains/market-recommendations";
import type { LinkedDomainError } from "@/lib/linked-domains/types";
import { isErr } from "@/lib/primitives/result/results";

import { createDomainResearchRoutes } from "../domain-research/domain-research.route";
import { createDomainSearchConsoleRoutes } from "../domain-search-console/domain-search-console.route";
import {
  createLinkedDomainBodySchema,
  marketRecommendationsBodySchema,
  linkedDomainIdParamSchema,
  updateLinkedDomainMarketsBodySchema,
  updateLinkedDomainProjectBodySchema,
  verifyLinkedDomainBodySchema,
} from "./linked-domain.schema";

const validateLinkedDomainParams = validator("param", (value, c) => {
  const parsed = linkedDomainIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_linked_domain_id");
  }
  return parsed.data;
});

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createLinkedDomainBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_linked_domain_payload",
      "Linked domain payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateVerifyBody = validator("json", (value, c) => {
  const parsed = verifyLinkedDomainBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_linked_domain_verify_payload",
      "Verification method is required.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateProjectUpdateBody = validator("json", (value, c) => {
  const parsed = updateLinkedDomainProjectBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_linked_domain_project_payload",
      "Project assignment is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateMarketRecommendationsBody = validator("json", (value, c) => {
  const parsed = marketRecommendationsBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_market_recommendations_payload",
      "Market recommendation payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateMarketUpdateBody = validator("json", (value, c) => {
  const parsed = updateLinkedDomainMarketsBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_market_selection",
      "Select supported markets.",
      parsed.error.flatten(),
    );
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

function mapLinkedDomainError(
  c: Parameters<typeof badRequestResponse>[0],
  error: LinkedDomainError,
) {
  switch (error.code) {
    case "audit_not_found":
    case "linked_domain_not_found":
    case "project_not_found":
      return notFoundResponse(c, error.code, error.message);
    case "domain_already_claimed":
    case "claim_pending_exists":
      return conflictResponse(c, error.code, error.message);
    default:
      return badRequestResponse(c, error.code, error.message);
  }
}

export function createLinkedDomainRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .use("*", requireWorkspaceDomainsFeature)
    .get("/", async (c) => {
      if (!canReadLinkedDomains(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const linkedDomains = await listLinkedDomains({
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.json({ linkedDomains }, 200);
    })
    .post(
      "/:linkedDomainId/market-recommendations",
      validateLinkedDomainParams,
      validateMarketRecommendationsBody,
      async (c) => {
        if (!canWriteLinkedDomains(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const { linkedDomainId } = c.req.valid("param");
        const linkedDomain = await getLinkedDomain({
          organizationId: c.var.auth.organization.localOrganizationId,
          linkedDomainId,
        });
        if (!linkedDomain) return notFoundResponse(c, "linked_domain_not_found");
        if (linkedDomain.status !== "verified" && linkedDomain.status !== "pending_verification") {
          return badRequestResponse(c, "linked_domain_not_verified", "Verify the domain first.");
        }

        const result = await recommendDomainMarkets({
          domain: linkedDomain.domainKey,
          cookie: c.req.header("cookie"),
          signal: c.req.raw.signal,
        });
        if (isErr(result)) {
          if (
            result.error.code === "invalid_domain" ||
            result.error.code === "provider_validation_failed"
          ) {
            return badRequestResponse(c, result.error.code, result.error.message);
          }
          if (result.error.code === "provider_rate_limited") {
            return c.json({ error: result.error.code, message: result.error.message }, 429);
          }
          return serviceUnavailableResponse(c, result.error.code, result.error.message);
        }

        return c.json({ marketRecommendations: result.value }, 200);
      },
    )
    .post("/", validateCreateBody, async (c) => {
      if (!canWriteLinkedDomains(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const body = c.req.valid("json");
      const result = body.domain
        ? await startDirectLinkedDomainClaim({
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
            domain: body.domain,
            marketIds: body.marketIds,
          })
        : await startLinkedDomainClaim({
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
            domainSlug: body.domainSlug!,
          });

      if (isErr(result)) {
        serverAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.ctaClick, {
          cta: "claim_domain_start_failed",
          status: result.error.code,
        });
        return mapLinkedDomainError(c, result.error);
      }

      serverAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.ctaClick, {
        cta: "claim_domain_started",
        status: result.value.status,
      });

      return c.json({ linkedDomain: result.value }, 201);
    })
    .get("/:linkedDomainId", validateLinkedDomainParams, async (c) => {
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

      return c.json({ linkedDomain }, 200);
    })
    .get("/:linkedDomainId/audit", validateLinkedDomainParams, async (c) => {
      if (!canReadLinkedDomains(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { linkedDomainId } = c.req.valid("param");
      const result = await getLinkedDomainAudit({
        organizationId: c.var.auth.organization.localOrganizationId,
        linkedDomainId,
      });

      if (isErr(result)) {
        return mapLinkedDomainError(c, result.error);
      }

      return c.json({ audit: result.value }, 200);
    })
    .post("/:linkedDomainId/verify", validateLinkedDomainParams, validateVerifyBody, async (c) => {
      if (!canWriteLinkedDomains(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { linkedDomainId } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await verifyAndClaimLinkedDomain({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        linkedDomainId,
        method: body.method,
        projectId: body.projectId,
        createProject: body.createProject ?? (!body.projectId ? true : undefined),
        marketIds: body.marketIds,
      });

      if (isErr(result)) {
        serverAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.ctaClick, {
          cta: "claim_domain_verify_failed",
          status: result.error.code,
        });
        return mapLinkedDomainError(c, result.error);
      }

      serverAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.ctaClick, {
        cta: "claim_domain_verified",
        status: result.value.status,
      });

      return c.json({ linkedDomain: result.value }, 200);
    })
    .patch(
      "/:linkedDomainId/markets",
      validateLinkedDomainParams,
      validateMarketUpdateBody,
      async (c) => {
        if (!canWriteLinkedDomains(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }
        const { linkedDomainId } = c.req.valid("param");
        const body = c.req.valid("json");
        const result = await updateLinkedDomainMarkets({
          organizationId: c.var.auth.organization.localOrganizationId,
          linkedDomainId,
          marketIds: body.marketIds,
        });
        if (isErr(result)) return mapLinkedDomainError(c, result.error);
        return c.json({ linkedDomain: result.value }, 200);
      },
    )
    .patch(
      "/:linkedDomainId/project",
      validateLinkedDomainParams,
      validateProjectUpdateBody,
      async (c) => {
        if (!canWriteLinkedDomains(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const { linkedDomainId } = c.req.valid("param");
        const body = c.req.valid("json");
        const result = await updateLinkedDomainProject({
          organizationId: c.var.auth.organization.localOrganizationId,
          linkedDomainId,
          projectId: body.projectId,
        });

        if (isErr(result)) {
          return mapLinkedDomainError(c, result.error);
        }

        return c.json({ linkedDomain: result.value }, 200);
      },
    )
    .delete("/:linkedDomainId", validateLinkedDomainParams, async (c) => {
      if (!canWriteLinkedDomains(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { linkedDomainId } = c.req.valid("param");
      const result = await cancelPendingLinkedDomainClaim({
        organizationId: c.var.auth.organization.localOrganizationId,
        linkedDomainId,
      });

      if (isErr(result)) {
        return mapLinkedDomainError(c, result.error);
      }

      return c.body(null, 204);
    })
    .route("/:linkedDomainId/research", createDomainResearchRoutes())
    .route("/:linkedDomainId/search-console", createDomainSearchConsoleRoutes());
}
