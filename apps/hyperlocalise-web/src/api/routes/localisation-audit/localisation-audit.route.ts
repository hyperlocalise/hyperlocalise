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

import {
  badRequestResponse,
  conflictResponse,
  notFoundResponse,
  serviceUnavailableResponse,
  tooManyRequestsResponse,
  unauthorizedResponse,
} from "@/api/response.schema";
import { env } from "@/lib/env";
import { isErr } from "@/lib/primitives/result/results";
import {
  createLocalisationAuditService,
  localisationAuditService,
  type LocalisationAuditService,
} from "@/lib/localisation-audit/service";
import type { LocalisationAuditError } from "@/lib/localisation-audit/types";
import type { LocalisationAuditQueue } from "@/lib/workflow/types";

import {
  confirmLocalisationAuditBodySchema,
  createLocalisationAuditBodySchema,
  localisationAuditIdParamSchema,
  localisationAuditReportSlugParamSchema,
  unlockLocalisationAuditBodySchema,
} from "./localisation-audit.schema";

function validationMiddleware<TSchema extends { safeParse(value: unknown): unknown }>(
  schema: TSchema,
  code: string,
) {
  return validator("json", (value, c) => {
    const parsed = schema.safeParse(value) as
      | { success: true; data: unknown }
      | { success: false; error: { flatten(): unknown } };
    if (!parsed.success) {
      return badRequestResponse(c, code, "The request payload is invalid.", parsed.error.flatten());
    }
    return parsed.data;
  });
}

const validateAuditId = validator("param", (value, c) => {
  const parsed = localisationAuditIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_audit_id", "The audit ID is invalid.");
  }
  return parsed.data;
});

const validateReportSlug = validator("param", (value, c) => {
  const parsed = localisationAuditReportSlugParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_report_slug", "The report slug is invalid.");
  }
  return parsed.data;
});

const validateCreateBody = validationMiddleware(
  createLocalisationAuditBodySchema,
  "invalid_audit_payload",
);
const validateConfirmBody = validationMiddleware(
  confirmLocalisationAuditBodySchema,
  "invalid_audit_confirmation",
);
const validateUnlockBody = validationMiddleware(
  unlockLocalisationAuditBodySchema,
  "invalid_audit_unlock_payload",
);

function mapAuditError(c: Parameters<typeof badRequestResponse>[0], error: LocalisationAuditError) {
  switch (error.code) {
    case "audit_not_found":
    case "report_not_found":
      return notFoundResponse(c, error.code, error.message);
    case "audit_rate_limited":
      return tooManyRequestsResponse(c, error.code, error.message);
    case "audit_not_awaiting_confirmation":
    case "audit_not_complete":
      return conflictResponse(c, error.code, error.message);
    case "audit_access_not_configured":
    case "audit_email_delivery_failed":
      return serviceUnavailableResponse(c, error.code, error.message);
    case "invalid_report_access_token":
      return unauthorizedResponse(c, error.code, error.message);
    default:
      return badRequestResponse(c, error.code, error.message);
  }
}

function requestIpAddress(headers: Headers): string {
  const connectingIp = headers.get("cf-connecting-ip")?.trim();
  if (connectingIp) {
    return connectingIp;
  }
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function createLocalisationAuditRoutes(
  options: {
    service?: LocalisationAuditService;
    localisationAuditQueue?: LocalisationAuditQueue;
  } = {},
) {
  const service =
    options.service ??
    (options.localisationAuditQueue
      ? createLocalisationAuditService({ queue: options.localisationAuditQueue })
      : localisationAuditService);

  return new Hono()
    .post("/audits", validateCreateBody, async (c) => {
      const body = c.req.valid("json") as { url: string };
      const result = await service.prepareAudit({
        url: body.url,
        ipAddress: requestIpAddress(c.req.raw.headers),
      });
      if (isErr(result)) {
        return mapAuditError(c, result.error);
      }
      return c.json({ audit: result.value }, 201);
    })
    .get("/audits/:auditId", validateAuditId, async (c) => {
      const { auditId } = c.req.valid("param");
      const result = await service.getAudit(auditId);
      if (isErr(result)) {
        return mapAuditError(c, result.error);
      }
      return c.json({ audit: result.value }, 200);
    })
    .patch("/audits/:auditId/confirm", validateAuditId, validateConfirmBody, async (c) => {
      const { auditId } = c.req.valid("param");
      const body = c.req.valid("json") as {
        targetLocale: string;
        targetMarket: string;
      };
      const result = await service.confirmAudit({
        auditId,
        targetLocale: body.targetLocale,
        targetMarket: body.targetMarket,
      });
      if (isErr(result)) {
        return mapAuditError(c, result.error);
      }
      return c.json({ audit: result.value }, 200);
    })
    .post("/audits/:auditId/unlock", validateAuditId, validateUnlockBody, async (c) => {
      const { auditId } = c.req.valid("param");
      const body = c.req.valid("json") as { email: string; name?: string };
      const result = await service.unlockAudit({
        auditId,
        email: body.email,
        name: body.name,
        origin: env.HYPERLOCALISE_PUBLIC_APP_URL ?? new URL(c.req.url).origin,
      });
      if (isErr(result)) {
        return mapAuditError(c, result.error);
      }
      return c.json({ report: { accessUrl: result.value.accessUrl } }, 200);
    })
    .get("/reports/:slug", validateReportSlug, async (c) => {
      const { slug } = c.req.valid("param");
      const result = await service.getPublicReport(slug);
      if (isErr(result)) {
        return mapAuditError(c, result.error);
      }
      return c.json({ report: result.value }, 200);
    });
}
