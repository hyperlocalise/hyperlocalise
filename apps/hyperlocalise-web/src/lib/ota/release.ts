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
import { desc, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import type { OtaDistribution, OtaRelease } from "@/lib/database/types";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import {
  cdnDestinationToS3Location,
  decryptCdnDestinationSecret,
  getCdnDestination,
} from "./destinations";
import { deleteOtaPrefix, manifestArtifactPointer, publishOtaSnapshot } from "./publisher";
import {
  createS3OtaObjectStore,
  hostedOtaS3Location,
  invalidateOtaCloudFront,
  type OtaS3Location,
} from "./s3-store";
import { buildOtaReleaseSnapshot } from "./snapshot";
import type { OtaObjectStore } from "./store";
import { hostedOtaPublicBaseUrl, otaManifestUrl } from "./urls";
import { otaDistributionWriter, type OtaDistributionWriterError } from "./writer";

export type OtaPublishError =
  | OtaDistributionWriterError
  | { code: "hosted_cdn_not_configured" }
  | { code: "destination_credentials_invalid" }
  | { code: "publish_failed"; message: string };

export type OtaResolvedTarget = {
  store: OtaObjectStore;
  publicBaseUrl: string;
};

let hostedStoreOverride: OtaObjectStore | null = null;
let objectStoreFactoryForTests: ((location: OtaS3Location) => OtaObjectStore) | null = null;

export function setHostedOtaObjectStoreForTests(store: OtaObjectStore | null) {
  hostedStoreOverride = store;
}

export function setOtaObjectStoreFactoryForTests(
  factory: ((location: OtaS3Location) => OtaObjectStore) | null,
) {
  objectStoreFactoryForTests = factory;
}

function objectStoreFor(location: OtaS3Location): OtaObjectStore {
  return objectStoreFactoryForTests?.(location) ?? createS3OtaObjectStore(location);
}

export function hostedOtaObjectStore(): OtaObjectStore | null {
  if (hostedStoreOverride) {
    return hostedStoreOverride;
  }
  const location = hostedOtaS3Location();
  if (!location) {
    return null;
  }
  return objectStoreFor(location);
}

async function invalidateHostedPrefix(distribution: OtaDistribution, hashes: readonly string[]) {
  if (distribution.destinationId) {
    return;
  }
  await invalidateOtaCloudFront(hashes);
}

export async function resolveOtaPublishTarget(
  distribution: OtaDistribution,
): Promise<Result<OtaResolvedTarget, OtaPublishError>> {
  if (!distribution.destinationId) {
    const store = hostedOtaObjectStore();
    if (!store) {
      return err({ code: "hosted_cdn_not_configured" });
    }
    return ok({
      store,
      publicBaseUrl: hostedOtaPublicBaseUrl(),
    });
  }

  const destination = await getCdnDestination({
    organizationId: distribution.organizationId,
    destinationId: distribution.destinationId,
  });
  if (!destination) {
    return err({ code: "destination_not_found" });
  }
  const secret = decryptCdnDestinationSecret(destination);
  if (isErr(secret)) {
    return err({ code: "destination_credentials_invalid" });
  }
  return ok({
    store: objectStoreFor(cdnDestinationToS3Location(destination, secret.value)),
    publicBaseUrl: destination.publicBaseUrl,
  });
}

async function loadDistribution(distributionId: string): Promise<OtaDistribution | null> {
  const [row] = await db
    .select()
    .from(schema.otaDistributions)
    .where(eq(schema.otaDistributions.id, distributionId))
    .limit(1);
  return row ?? null;
}

async function loadLatestRelease(distributionId: string): Promise<OtaRelease | null> {
  const [row] = await db
    .select()
    .from(schema.otaReleases)
    .where(eq(schema.otaReleases.distributionId, distributionId))
    .orderBy(desc(schema.otaReleases.sequence))
    .limit(1);
  return row ?? null;
}

export async function publishOtaDistributionRelease(input: {
  distributionId: string;
  actorUserId: string;
}): Promise<Result<{ release: OtaRelease; manifestUrl: string }, OtaPublishError>> {
  const distribution = await loadDistribution(input.distributionId);
  if (!distribution) {
    return err({ code: "distribution_not_found" });
  }
  if (distribution.revokedAt) {
    return err({ code: "revoked" });
  }

  const [project] = await db
    .select({
      sourceLocale: schema.projects.sourceLocale,
    })
    .from(schema.projects)
    .where(eq(schema.projects.id, distribution.projectId))
    .limit(1);

  const target = await resolveOtaPublishTarget(distribution);
  if (!target.ok) {
    return target;
  }

  const snapshot = await buildOtaReleaseSnapshot({
    organizationId: distribution.organizationId,
    projectId: distribution.projectId,
    fileIds: distribution.fileIds,
    locales: distribution.locales,
    format: distribution.format,
    sourceLocale: project?.sourceLocale ?? null,
  });

  try {
    await publishOtaSnapshot({
      store: target.value.store,
      hash: distribution.publicHash,
      format: distribution.format,
      snapshot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not write the CDN snapshot.";
    return err({ code: "publish_failed", message });
  }

  const released = await otaDistributionWriter.release({
    distributionId: distribution.id,
    actorUserId: input.actorUserId,
    artifactPointer: manifestArtifactPointer(distribution.publicHash),
    manifest: snapshot.manifest,
  });
  if (!released.ok) {
    return released;
  }

  await invalidateHostedPrefix(distribution, [distribution.publicHash]);
  return ok({
    release: released.value,
    manifestUrl: otaManifestUrl(target.value.publicBaseUrl, distribution.publicHash),
  });
}

export async function rotateOtaDistributionHash(input: {
  distributionId: string;
  actorUserId: string;
}): Promise<Result<{ distribution: OtaDistribution; previousHash: string }, OtaPublishError>> {
  const existing = await loadDistribution(input.distributionId);
  if (!existing) {
    return err({ code: "distribution_not_found" });
  }
  if (existing.revokedAt) {
    return err({ code: "revoked" });
  }

  const target = await resolveOtaPublishTarget(existing);
  if (!target.ok) {
    return target;
  }

  const latest = await loadLatestRelease(existing.id);
  const rotated = await otaDistributionWriter.rotate({
    distributionId: existing.id,
    actorUserId: input.actorUserId,
  });
  if (!rotated.ok) {
    return rotated;
  }

  if (latest?.status === "success" && latest.manifest) {
    const [project] = await db
      .select({ sourceLocale: schema.projects.sourceLocale })
      .from(schema.projects)
      .where(eq(schema.projects.id, existing.projectId))
      .limit(1);
    const snapshot = await buildOtaReleaseSnapshot({
      organizationId: existing.organizationId,
      projectId: existing.projectId,
      fileIds: rotated.value.distribution.fileIds,
      locales: rotated.value.distribution.locales,
      format: rotated.value.distribution.format,
      sourceLocale: project?.sourceLocale ?? null,
    });
    snapshot.manifest.timestamp = latest.manifest.timestamp;
    try {
      await publishOtaSnapshot({
        store: target.value.store,
        hash: rotated.value.distribution.publicHash,
        format: rotated.value.distribution.format,
        snapshot,
      });
    } catch (error) {
      await db
        .update(schema.otaDistributions)
        .set({
          publicHash: rotated.value.previousHash,
          updatedByUserId: input.actorUserId,
          updatedAt: new Date(),
        })
        .where(eq(schema.otaDistributions.id, existing.id));
      const message = error instanceof Error ? error.message : "Could not write the CDN snapshot.";
      return err({ code: "publish_failed", message });
    }
  }

  await deleteOtaPrefix(target.value.store, rotated.value.previousHash);
  await invalidateHostedPrefix(existing, [
    rotated.value.previousHash,
    rotated.value.distribution.publicHash,
  ]);
  return ok(rotated.value);
}

export async function revokeOtaDistributionAndPurge(input: {
  distributionId: string;
  actorUserId: string;
}): Promise<Result<OtaDistribution, OtaPublishError>> {
  const existing = await loadDistribution(input.distributionId);
  if (!existing) {
    return err({ code: "distribution_not_found" });
  }

  const target = existing.revokedAt ? null : await resolveOtaPublishTarget(existing);
  if (target && !target.ok && target.error.code !== "hosted_cdn_not_configured") {
    return target;
  }

  const revoked = await otaDistributionWriter.revoke({
    distributionId: existing.id,
    actorUserId: input.actorUserId,
  });
  if (!revoked.ok) {
    return revoked;
  }

  if (target?.ok) {
    await deleteOtaPrefix(target.value.store, existing.publicHash);
    await invalidateHostedPrefix(existing, [existing.publicHash]);
  }

  return ok(revoked.value);
}
