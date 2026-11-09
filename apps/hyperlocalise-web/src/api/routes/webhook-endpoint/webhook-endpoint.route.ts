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
  internalErrorResponse,
  notFoundResponse,
  type JsonContext,
} from "@/api/response.schema";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  listWebhookDeliveries,
  listWebhookEndpoints,
  rotateWebhookEndpointSecret,
  sendWebhookTestEvent,
  updateWebhookEndpoint,
  type WebhookEndpointError,
} from "@/lib/outbound-webhooks/webhook-endpoints";
import { isErr } from "@/lib/primitives/result/results";

import {
  createWebhookEndpointBodySchema,
  updateWebhookEndpointBodySchema,
  webhookEndpointParamsSchema,
} from "./webhook-endpoint.schema";

// Webhook endpoints sit with API keys under developer settings, behind the same capabilities.
const READ_CAPABILITY = "api_keys:read";
const WRITE_CAPABILITY = "api_keys:write";

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createWebhookEndpointBodySchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : badRequestResponse(c, "invalid_webhook_endpoint_payload", parsed.error.issues[0]?.message);
});

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateWebhookEndpointBodySchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : badRequestResponse(c, "invalid_webhook_endpoint_payload", parsed.error.issues[0]?.message);
});

const validateParams = validator("param", (value, c) => {
  const parsed = webhookEndpointParamsSchema.safeParse(value);
  return parsed.success ? parsed.data : notFoundResponse(c, "webhook_endpoint_not_found");
});

function webhookEndpointErrorResponse(c: JsonContext, error: WebhookEndpointError) {
  switch (error.code) {
    case "webhook_endpoint_not_found":
      return notFoundResponse(c, error.code);
    case "webhook_endpoint_limit_reached":
      return conflictResponse(
        c,
        error.code,
        "This workspace has reached its webhook endpoint limit.",
      );
    case "webhook_url_invalid":
      return badRequestResponse(c, error.code, "Use an HTTPS URL on a public host.");
    case "webhook_secret_encryption_failed":
      return internalErrorResponse(c, error.code);
  }
}

export function createWebhookEndpointRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, READ_CAPABILITY)) {
        return forbiddenResponse(c);
      }
      const webhookEndpoints = await listWebhookEndpoints(
        c.var.auth.organization.localOrganizationId,
      );
      return c.json({ webhookEndpoints }, 200);
    })
    .post("/", validateCreateBody, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, WRITE_CAPABILITY)) {
        return forbiddenResponse(c);
      }
      const body = c.req.valid("json");
      const result = await createWebhookEndpoint({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        url: body.url,
        description: body.description,
        eventTypes: body.eventTypes,
        projectId: body.projectId,
      });
      if (isErr(result)) {
        return webhookEndpointErrorResponse(c, result.error);
      }
      return c.json({ webhookEndpoint: result.value.endpoint, secret: result.value.secret }, 201);
    })
    .patch("/:endpointId", validateParams, validateUpdateBody, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, WRITE_CAPABILITY)) {
        return forbiddenResponse(c);
      }
      const result = await updateWebhookEndpoint({
        organizationId: c.var.auth.organization.localOrganizationId,
        endpointId: c.req.valid("param").endpointId,
        ...c.req.valid("json"),
      });
      if (isErr(result)) {
        return webhookEndpointErrorResponse(c, result.error);
      }
      return c.json({ webhookEndpoint: result.value }, 200);
    })
    .delete("/:endpointId", validateParams, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, WRITE_CAPABILITY)) {
        return forbiddenResponse(c);
      }
      const result = await deleteWebhookEndpoint({
        organizationId: c.var.auth.organization.localOrganizationId,
        endpointId: c.req.valid("param").endpointId,
      });
      if (isErr(result)) {
        return webhookEndpointErrorResponse(c, result.error);
      }
      return c.body(null, 204);
    })
    .post("/:endpointId/rotate-secret", validateParams, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, WRITE_CAPABILITY)) {
        return forbiddenResponse(c);
      }
      const result = await rotateWebhookEndpointSecret({
        organizationId: c.var.auth.organization.localOrganizationId,
        endpointId: c.req.valid("param").endpointId,
      });
      if (isErr(result)) {
        return webhookEndpointErrorResponse(c, result.error);
      }
      return c.json({ secret: result.value.secret }, 200);
    })
    .post("/:endpointId/test", validateParams, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, WRITE_CAPABILITY)) {
        return forbiddenResponse(c);
      }
      const result = await sendWebhookTestEvent({
        organizationId: c.var.auth.organization.localOrganizationId,
        endpointId: c.req.valid("param").endpointId,
      });
      if (isErr(result)) {
        return webhookEndpointErrorResponse(c, result.error);
      }
      return c.json({ webhookDelivery: result.value }, 200);
    })
    .get("/:endpointId/deliveries", validateParams, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, READ_CAPABILITY)) {
        return forbiddenResponse(c);
      }
      const result = await listWebhookDeliveries({
        organizationId: c.var.auth.organization.localOrganizationId,
        endpointId: c.req.valid("param").endpointId,
      });
      if (isErr(result)) {
        return webhookEndpointErrorResponse(c, result.error);
      }
      return c.json({ webhookDeliveries: result.value }, 200);
    });
}
