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
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { isProjectMutationAllowed, roleHasCapability } from "@/api/auth/capability-guards";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { validationErrorResponse } from "@/api/errors";
import {
  badRequestResponse,
  conflictResponse,
  notFoundResponse,
  serviceUnavailableResponse,
  type JsonContext,
} from "@/api/response.schema";
import {
  getOwnedProjectRecord,
  projectForbiddenResponse,
  projectNotFoundResponse,
} from "@/api/routes/project/project.shared";
import { db, schema } from "@/lib/database/client";
import type { OtaDistribution, OtaRelease } from "@/lib/database/types";
import { getCdnDestination, listCdnDestinations } from "@/lib/ota/destinations";
import {
  publishOtaDistributionRelease,
  revokeOtaDistributionAndPurge,
  rotateOtaDistributionHash,
  type OtaPublishError,
} from "@/lib/ota/release";
import { hostedOtaPublicBaseUrl, otaManifestUrl } from "@/lib/ota/urls";
import { otaDistributionWriter, type OtaDistributionWriterError } from "@/lib/ota/writer";
import { isErr } from "@/lib/primitives/result/results";

import {
  createOtaDistributionBodySchema,
  otaDistributionParamsSchema,
  otaDistributionProjectParamsSchema,
  updateOtaDistributionBodySchema,
} from "./ota-distribution.schema";

type OtaDistributionView = {
  id: string;
  name: string;
  publicHash: string;
  format: OtaDistribution["format"];
  fileIds: string[];
  locales: string[];
  destinationId: string | null;
  destinationName: string | null;
  manifestUrl: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  latestRelease: {
    id: string;
    sequence: number;
    status: OtaRelease["status"];
    releasedAt: string;
    timestamp: number;
  } | null;
};

const validateProjectParams = validator("param", (value, c) => {
  const parsed = otaDistributionProjectParamsSchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_project_params",
      "Invalid project",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateDistributionParams = validator("param", (value, c) => {
  const parsed = otaDistributionParamsSchema.safeParse(value);
  if (!parsed.success) {
    return notFoundResponse(c, "distribution_not_found");
  }
  return parsed.data;
});

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createOtaDistributionBodySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_ota_distribution_payload",
      "Invalid distribution",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateOtaDistributionBodySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_ota_distribution_payload",
      "Invalid distribution",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

async function requireNativeProject(c: {
  var: AuthVariables;
  req: { valid: (target: "param") => { projectId: string } };
  json: JsonContext["json"];
}) {
  const { projectId } = c.req.valid("param");
  if (!roleHasCapability(c.var.auth.membership.role, "projects:read")) {
    return { error: projectForbiddenResponse(c) };
  }
  const project = await getOwnedProjectRecord(c.var.auth, projectId);
  if (!project) {
    return { error: projectNotFoundResponse(c) };
  }
  if (project.source !== "native") {
    return {
      error: badRequestResponse(
        c,
        "not_native_project",
        "CDN distributions are available on native projects only.",
      ),
    };
  }
  return { project };
}

async function extrasFor(
  distribution: OtaDistribution,
  latestRelease: OtaRelease | null = null,
): Promise<{
  destinationName: string | null;
  publicBaseUrl: string;
  latestRelease: OtaRelease | null;
}> {
  if (!distribution.destinationId) {
    return {
      destinationName: "Hyperlocalise CDN",
      publicBaseUrl: hostedOtaPublicBaseUrl(),
      latestRelease,
    };
  }

  const destination = await getCdnDestination({
    organizationId: distribution.organizationId,
    destinationId: distribution.destinationId,
  });
  return {
    destinationName: destination?.name ?? null,
    publicBaseUrl: destination?.publicBaseUrl ?? hostedOtaPublicBaseUrl(),
    latestRelease,
  };
}

function toView(
  distribution: OtaDistribution,
  extras: {
    destinationName: string | null;
    publicBaseUrl: string;
    latestRelease: OtaRelease | null;
  },
): OtaDistributionView {
  return {
    id: distribution.id,
    name: distribution.name,
    publicHash: distribution.publicHash,
    format: distribution.format,
    fileIds: distribution.fileIds,
    locales: distribution.locales,
    destinationId: distribution.destinationId,
    destinationName: extras.destinationName,
    manifestUrl: distribution.revokedAt
      ? null
      : otaManifestUrl(extras.publicBaseUrl, distribution.publicHash),
    revokedAt: distribution.revokedAt?.toISOString() ?? null,
    createdAt: distribution.createdAt.toISOString(),
    updatedAt: distribution.updatedAt.toISOString(),
    latestRelease: extras.latestRelease
      ? {
          id: extras.latestRelease.id,
          sequence: extras.latestRelease.sequence,
          status: extras.latestRelease.status,
          releasedAt: extras.latestRelease.releasedAt.toISOString(),
          timestamp: extras.latestRelease.manifest.timestamp,
        }
      : null,
  };
}

async function loadLatestReleases(distributionIds: string[]): Promise<Map<string, OtaRelease>> {
  if (distributionIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select()
    .from(schema.otaReleases)
    .where(inArray(schema.otaReleases.distributionId, distributionIds))
    .orderBy(desc(schema.otaReleases.sequence));

  const latest = new Map<string, OtaRelease>();
  for (const row of rows) {
    if (!latest.has(row.distributionId)) {
      latest.set(row.distributionId, row);
    }
  }
  return latest;
}

function writerErrorResponse(c: JsonContext, error: OtaDistributionWriterError) {
  switch (error.code) {
    case "project_not_found":
    case "distribution_not_found":
      return notFoundResponse(c, error.code);
    case "not_native_project":
      return badRequestResponse(
        c,
        error.code,
        "CDN distributions are available on native projects only.",
      );
    case "revoked":
      return conflictResponse(c, error.code, "This distribution has been revoked.");
    case "invalid_name":
      return badRequestResponse(c, error.code, "Enter a distribution name.");
    case "invalid_format":
      return badRequestResponse(c, error.code, "Choose json, android_xml, or ios_strings.");
    case "empty_file_ids":
      return badRequestResponse(c, error.code, "Select at least one source file.");
    case "empty_locales":
      return badRequestResponse(c, error.code, "Select at least one locale.");
    case "unknown_file_ids":
      return badRequestResponse(c, error.code, "One or more files are not in this project.", {
        fileIds: error.fileIds,
      });
    case "invalid_locales":
      return badRequestResponse(c, error.code, "One or more locales are invalid.", {
        locales: error.locales,
      });
    case "locales_not_in_project":
      return badRequestResponse(c, error.code, "Choose locales that belong to this project.", {
        locales: error.locales,
      });
    case "export_path_collision":
      return conflictResponse(
        c,
        error.code,
        "Selected files share the same export filename. Use files with unique basenames.",
        { exportPaths: error.exportPaths },
      );
    case "destination_not_found":
      return notFoundResponse(c, error.code, "CDN destination not found.");
    case "hash_collision":
      return conflictResponse(c, error.code, "Could not allocate a unique distribution hash.");
    default:
      return badRequestResponse(c, "invalid_ota_distribution_payload", "Invalid distribution");
  }
}

function publishErrorResponse(c: JsonContext, error: OtaPublishError) {
  switch (error.code) {
    case "hosted_cdn_not_configured":
      return serviceUnavailableResponse(
        c,
        error.code,
        "Hosted CDN storage is not configured. Add a workspace S3 destination or set OTA_S3_BUCKET.",
      );
    case "destination_credentials_invalid":
      return serviceUnavailableResponse(
        c,
        error.code,
        "The custom S3 destination credentials could not be decrypted.",
      );
    case "publish_failed":
      return serviceUnavailableResponse(c, error.code, error.message);
    default:
      return writerErrorResponse(c, error);
  }
}

export function createOtaDistributionRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", validateProjectParams, async (c) => {
      const resolved = await requireNativeProject(c);
      if ("error" in resolved) {
        return resolved.error;
      }

      const distributions = await db
        .select()
        .from(schema.otaDistributions)
        .where(eq(schema.otaDistributions.projectId, resolved.project.id))
        .orderBy(asc(schema.otaDistributions.createdAt));

      const files = await db
        .select({
          id: schema.repositorySourceFiles.id,
          sourcePath: schema.repositorySourceFiles.sourcePath,
        })
        .from(schema.repositorySourceFiles)
        .where(eq(schema.repositorySourceFiles.projectId, resolved.project.id))
        .orderBy(asc(schema.repositorySourceFiles.sourcePath));

      const latestReleases = await loadLatestReleases(distributions.map((row) => row.id));
      const destinations = await listCdnDestinations(resolved.project.organizationId);
      const destinationById = new Map(
        destinations.map((destination) => [destination.id, destination]),
      );
      const hostedBaseUrl = hostedOtaPublicBaseUrl();
      const views: OtaDistributionView[] = distributions.map((distribution) => {
        const destination = distribution.destinationId
          ? destinationById.get(distribution.destinationId)
          : undefined;
        return toView(distribution, {
          destinationName:
            destination?.name ?? (distribution.destinationId ? null : "Hyperlocalise CDN"),
          publicBaseUrl: destination?.publicBaseUrl ?? hostedBaseUrl,
          latestRelease: latestReleases.get(distribution.id) ?? null,
        });
      });

      return c.json(
        {
          distributions: views,
          destinations: destinations.map((destination) => ({
            id: destination.id,
            name: destination.name,
            publicBaseUrl: destination.publicBaseUrl,
            validationStatus: destination.validationStatus,
          })),
          files,
          locales: [resolved.project.sourceLocale, ...resolved.project.targetLocales].filter(
            (locale): locale is string => Boolean(locale),
          ),
        },
        200,
      );
    })
    .post("/", validateProjectParams, validateCreateBody, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }
      const resolved = await requireNativeProject(c);
      if ("error" in resolved) {
        return resolved.error;
      }
      const body = c.req.valid("json");
      const created = await otaDistributionWriter.create({
        projectId: resolved.project.id,
        name: body.name,
        fileIds: body.fileIds,
        locales: body.locales,
        format: body.format,
        destinationId: body.destinationId,
        actorUserId: c.var.auth.user.localUserId,
      });
      if (isErr(created)) {
        return writerErrorResponse(c, created.error);
      }
      return c.json(
        {
          distribution: toView(created.value, await extrasFor(created.value)),
        },
        201,
      );
    })
    .patch("/:distributionId", validateDistributionParams, validateUpdateBody, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }
      const resolved = await requireNativeProject(c);
      if ("error" in resolved) {
        return resolved.error;
      }
      const { distributionId } = c.req.valid("param");
      const [existing] = await db
        .select()
        .from(schema.otaDistributions)
        .where(
          and(
            eq(schema.otaDistributions.id, distributionId),
            eq(schema.otaDistributions.projectId, resolved.project.id),
          ),
        )
        .limit(1);
      if (!existing) {
        return notFoundResponse(c, "distribution_not_found");
      }

      const body = c.req.valid("json");
      const updated = await otaDistributionWriter.update({
        distributionId,
        actorUserId: c.var.auth.user.localUserId,
        ...body,
      });
      if (isErr(updated)) {
        return writerErrorResponse(c, updated.error);
      }
      return c.json(
        {
          distribution: toView(updated.value, await extrasFor(updated.value)),
        },
        200,
      );
    })
    .post("/:distributionId/release", validateDistributionParams, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }
      const resolved = await requireNativeProject(c);
      if ("error" in resolved) {
        return resolved.error;
      }
      const { distributionId } = c.req.valid("param");
      const [existing] = await db
        .select({ id: schema.otaDistributions.id })
        .from(schema.otaDistributions)
        .where(
          and(
            eq(schema.otaDistributions.id, distributionId),
            eq(schema.otaDistributions.projectId, resolved.project.id),
          ),
        )
        .limit(1);
      if (!existing) {
        return notFoundResponse(c, "distribution_not_found");
      }

      const published = await publishOtaDistributionRelease({
        distributionId,
        actorUserId: c.var.auth.user.localUserId,
      });
      if (isErr(published)) {
        return publishErrorResponse(c, published.error);
      }
      return c.json(
        { release: published.value.release, manifestUrl: published.value.manifestUrl },
        201,
      );
    })
    .post("/:distributionId/rotate", validateDistributionParams, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }
      const resolved = await requireNativeProject(c);
      if ("error" in resolved) {
        return resolved.error;
      }
      const { distributionId } = c.req.valid("param");
      const rotated = await rotateOtaDistributionHash({
        distributionId,
        actorUserId: c.var.auth.user.localUserId,
      });
      if (isErr(rotated)) {
        return publishErrorResponse(c, rotated.error);
      }
      return c.json(
        {
          distribution: toView(
            rotated.value.distribution,
            await extrasFor(rotated.value.distribution),
          ),
          previousHash: rotated.value.previousHash,
        },
        200,
      );
    })
    .post("/:distributionId/revoke", validateDistributionParams, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }
      const resolved = await requireNativeProject(c);
      if ("error" in resolved) {
        return resolved.error;
      }
      const { distributionId } = c.req.valid("param");
      const revoked = await revokeOtaDistributionAndPurge({
        distributionId,
        actorUserId: c.var.auth.user.localUserId,
      });
      if (isErr(revoked)) {
        return publishErrorResponse(c, revoked.error);
      }
      return c.json(
        {
          distribution: toView(revoked.value, await extrasFor(revoked.value)),
        },
        200,
      );
    });
}
