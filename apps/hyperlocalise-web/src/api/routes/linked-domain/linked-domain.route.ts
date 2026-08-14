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
  conflictResponse,
  forbiddenResponse,
  notFoundResponse,
} from "@/api/response.schema";
import {
  cancelPendingLinkedDomainClaim,
  getLinkedDomain,
  listLinkedDomains,
  startLinkedDomainClaim,
  verifyAndClaimLinkedDomain,
} from "@/lib/linked-domains/claims";
import type { LinkedDomainError } from "@/lib/linked-domains/types";
import { LOCALISATION_AUDIT_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { isErr } from "@/lib/primitives/result/results";

import {
  createLinkedDomainBodySchema,
  linkedDomainIdParamSchema,
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

function canReadLinkedDomains(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "projects:read");
}

function canWriteLinkedDomains(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "projects:create");
}

function mapLinkedDomainError(
  c: Parameters<typeof badRequestResponse>[0],
  error: LinkedDomainError,
) {
  switch (error.code) {
    case "audit_not_found":
    case "linked_domain_not_found":
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
    .get("/", async (c) => {
      if (!canReadLinkedDomains(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const linkedDomains = await listLinkedDomains({
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.json({ linkedDomains }, 200);
    })
    .post("/", validateCreateBody, async (c) => {
      if (!canWriteLinkedDomains(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const body = c.req.valid("json");
      const result = await startLinkedDomainClaim({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        domainSlug: body.domainSlug,
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
    });
}
