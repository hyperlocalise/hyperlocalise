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
import { validationErrorResponse } from "@/api/errors";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  internalErrorResponse,
  notFoundResponse,
  serviceUnavailableResponse,
  type JsonContext,
} from "@/api/response.schema";
import {
  createCdnDestination,
  deleteCdnDestination,
  listCdnDestinations,
  updateCdnDestination,
  type CdnDestinationSummary,
  type CdnDestinationWriterError,
} from "@/lib/ota/destinations";
import { isErr } from "@/lib/primitives/result/results";

import {
  cdnDestinationParamsSchema,
  createCdnDestinationBodySchema,
  updateCdnDestinationBodySchema,
} from "./cdn-destination.schema";

const READ_CAPABILITY = "projects:read";
const WRITE_CAPABILITY = "projects:write";

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createCdnDestinationBodySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_cdn_destination_payload",
      "Invalid CDN destination",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateCdnDestinationBodySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_cdn_destination_payload",
      "Invalid CDN destination",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateParams = validator("param", (value, c) => {
  const parsed = cdnDestinationParamsSchema.safeParse(value);
  return parsed.success ? parsed.data : notFoundResponse(c, "destination_not_found");
});

type CdnDestinationView = {
  id: string;
  name: string;
  bucket: string;
  region: string;
  endpoint: string | null;
  publicBaseUrl: string;
  usePathStyle: boolean;
  maskedSecretSuffix: string;
  validationStatus: string;
  validationMessage: string | null;
  lastValidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toView(row: CdnDestinationSummary): CdnDestinationView {
  return {
    id: row.id,
    name: row.name,
    bucket: row.bucket,
    region: row.region,
    endpoint: row.endpoint,
    publicBaseUrl: row.publicBaseUrl,
    usePathStyle: row.usePathStyle,
    maskedSecretSuffix: row.maskedSecretSuffix,
    validationStatus: row.validationStatus,
    validationMessage: row.validationMessage,
    lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function destinationErrorResponse(c: JsonContext, error: CdnDestinationWriterError) {
  switch (error.code) {
    case "destination_not_found":
      return notFoundResponse(c, error.code, "CDN destination not found.");
    case "destination_in_use":
      return conflictResponse(
        c,
        error.code,
        "Move or revoke distributions that use this destination first.",
      );
    case "destination_name_taken":
      return conflictResponse(c, error.code, "A destination with this name already exists.");
    case "invalid_name":
      return badRequestResponse(c, error.code, "Enter a destination name.");
    case "invalid_bucket":
      return badRequestResponse(c, error.code, "Enter a valid S3 bucket name.");
    case "invalid_region":
      return badRequestResponse(c, error.code, "Enter a valid AWS region.");
    case "invalid_endpoint":
      return badRequestResponse(c, error.code, "Use an HTTPS S3-compatible endpoint.");
    case "invalid_public_base_url":
      return badRequestResponse(c, error.code, "Use an HTTPS public base URL.");
    case "invalid_credentials":
      return badRequestResponse(c, error.code, "Enter valid AWS access keys.");
    case "destination_probe_failed":
      return serviceUnavailableResponse(
        c,
        error.code,
        error.message || "Could not access the S3 bucket with these credentials.",
      );
    case "crypto_failed":
      return internalErrorResponse(c, error.code);
  }
}

export function createCdnDestinationRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, READ_CAPABILITY)) {
        return forbiddenResponse(c);
      }
      const destinations = await listCdnDestinations(c.var.auth.organization.localOrganizationId);
      return c.json({ destinations: destinations.map(toView) }, 200);
    })
    .post("/", validateCreateBody, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, WRITE_CAPABILITY)) {
        return forbiddenResponse(c);
      }
      const body = c.req.valid("json");
      const created = await createCdnDestination({
        organizationId: c.var.auth.organization.localOrganizationId,
        actorUserId: c.var.auth.user.localUserId,
        name: body.name,
        bucket: body.bucket,
        region: body.region,
        endpoint: body.endpoint,
        publicBaseUrl: body.publicBaseUrl,
        usePathStyle: body.usePathStyle,
        accessKeyId: body.accessKeyId,
        secretAccessKey: body.secretAccessKey,
        sessionToken: body.sessionToken,
      });
      if (isErr(created)) {
        return destinationErrorResponse(c, created.error);
      }
      return c.json({ destination: toView(created.value) }, 201);
    })
    .patch("/:destinationId", validateParams, validateUpdateBody, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, WRITE_CAPABILITY)) {
        return forbiddenResponse(c);
      }
      const updated = await updateCdnDestination({
        organizationId: c.var.auth.organization.localOrganizationId,
        destinationId: c.req.valid("param").destinationId,
        actorUserId: c.var.auth.user.localUserId,
        ...c.req.valid("json"),
      });
      if (isErr(updated)) {
        return destinationErrorResponse(c, updated.error);
      }
      return c.json({ destination: toView(updated.value) }, 200);
    })
    .delete("/:destinationId", validateParams, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, WRITE_CAPABILITY)) {
        return forbiddenResponse(c);
      }
      const deleted = await deleteCdnDestination({
        organizationId: c.var.auth.organization.localOrganizationId,
        destinationId: c.req.valid("param").destinationId,
      });
      if (isErr(deleted)) {
        return destinationErrorResponse(c, deleted.error);
      }
      return c.body(null, 204);
    });
}
