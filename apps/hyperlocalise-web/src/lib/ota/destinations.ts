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
import { and, desc, eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import type { OrganizationCdnDestination } from "@/lib/database/types";
import { createLogger, serializeErrorForLog } from "@/lib/log";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  maskProviderCredentialSuffix,
} from "@/lib/security/provider-credential-crypto";
import { validatePublicHttpUrl } from "@/lib/security/ssrf-guard";

import { probeS3Location, type OtaS3Credentials, type OtaS3Location } from "./s3-store";

const logger = createLogger("ota-destinations");

type CdnDestinationProbe = (location: OtaS3Location) => Promise<void>;

let probeOverrideForTests: CdnDestinationProbe | null = null;

export function setCdnDestinationProbeForTests(probe: CdnDestinationProbe | null) {
  probeOverrideForTests = probe;
}

const DESTINATION_NAME_MAX_LENGTH = 120;
const AWS_BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const AWS_REGION_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

export type CdnDestinationWriterError =
  | { code: "invalid_name" }
  | { code: "invalid_bucket" }
  | { code: "invalid_region" }
  | { code: "invalid_endpoint" }
  | { code: "invalid_public_base_url" }
  | { code: "invalid_credentials" }
  | { code: "destination_not_found" }
  | { code: "destination_in_use" }
  | { code: "destination_name_taken" }
  | { code: "destination_probe_failed"; message: string }
  | { code: "crypto_failed" };

function isUniqueViolation(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  if ("code" in error && error.code === "23505") {
    return true;
  }
  const cause = "cause" in error ? error.cause : undefined;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

export type CdnDestinationSecret = OtaS3Credentials;

export type CdnDestinationSummary = {
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
  lastValidatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateCdnDestinationInput = {
  organizationId: string;
  actorUserId: string;
  name: string;
  bucket: string;
  region: string;
  endpoint?: string | null;
  publicBaseUrl: string;
  usePathStyle?: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | null;
  probe?: (location: OtaS3Location) => Promise<void>;
};

export type UpdateCdnDestinationInput = {
  destinationId: string;
  organizationId: string;
  actorUserId: string;
  name?: string;
  bucket?: string;
  region?: string;
  endpoint?: string | null;
  publicBaseUrl?: string;
  usePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string | null;
  probe?: (location: OtaS3Location) => Promise<void>;
};

function summarize(row: OrganizationCdnDestination): CdnDestinationSummary {
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
    lastValidatedAt: row.lastValidatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeName(name: string): Result<string, CdnDestinationWriterError> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > DESTINATION_NAME_MAX_LENGTH) {
    return err({ code: "invalid_name" });
  }
  return ok(trimmed);
}

function normalizeBucket(bucket: string): Result<string, CdnDestinationWriterError> {
  const trimmed = bucket.trim();
  if (!AWS_BUCKET_PATTERN.test(trimmed) || trimmed.includes("..")) {
    return err({ code: "invalid_bucket" });
  }
  return ok(trimmed);
}

function normalizeRegion(region: string): Result<string, CdnDestinationWriterError> {
  const trimmed = region.trim();
  if (!AWS_REGION_PATTERN.test(trimmed)) {
    return err({ code: "invalid_region" });
  }
  return ok(trimmed);
}

function normalizeEndpoint(
  endpoint: string | null | undefined,
): Result<string | null, CdnDestinationWriterError> {
  if (endpoint == null || endpoint.trim().length === 0) {
    return ok(null);
  }
  const parsed = validatePublicHttpUrl(endpoint.trim());
  if (!parsed.ok || parsed.value.protocol !== "https:") {
    return err({ code: "invalid_endpoint" });
  }
  return ok(parsed.value.toString().replace(/\/+$/, ""));
}

function normalizePublicBaseUrl(url: string): Result<string, CdnDestinationWriterError> {
  const parsed = validatePublicHttpUrl(url.trim());
  if (!parsed.ok || parsed.value.protocol !== "https:") {
    return err({ code: "invalid_public_base_url" });
  }
  return ok(parsed.value.toString().replace(/\/+$/, ""));
}

function normalizeCredentials(input: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | null;
}): Result<CdnDestinationSecret, CdnDestinationWriterError> {
  const accessKeyId = input.accessKeyId.trim();
  const secretAccessKey = input.secretAccessKey.trim();
  const sessionToken = input.sessionToken?.trim();
  if (accessKeyId.length < 16 || secretAccessKey.length < 16) {
    return err({ code: "invalid_credentials" });
  }
  return ok({
    accessKeyId,
    secretAccessKey,
    sessionToken: sessionToken && sessionToken.length > 0 ? sessionToken : undefined,
  });
}

function encryptSecret(secret: CdnDestinationSecret): Result<
  {
    encryptionAlgorithm: string;
    ciphertext: string;
    iv: string;
    authTag: string;
    keyVersion: number;
    maskedSecretSuffix: string;
  },
  CdnDestinationWriterError
> {
  const encrypted = encryptProviderCredential(JSON.stringify(secret));
  if (isErr(encrypted)) {
    return err({ code: "crypto_failed" });
  }
  return ok({
    encryptionAlgorithm: encrypted.value.algorithm,
    ciphertext: encrypted.value.ciphertext,
    iv: encrypted.value.iv,
    authTag: encrypted.value.authTag,
    keyVersion: encrypted.value.keyVersion,
    maskedSecretSuffix: maskProviderCredentialSuffix(secret.accessKeyId),
  });
}

export function decryptCdnDestinationSecret(
  row: OrganizationCdnDestination,
): Result<CdnDestinationSecret, CdnDestinationWriterError> {
  const decrypted = decryptProviderCredential({
    algorithm: row.encryptionAlgorithm,
    keyVersion: row.keyVersion,
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
  });
  if (isErr(decrypted)) {
    return err({ code: "crypto_failed" });
  }

  try {
    const parsed = JSON.parse(decrypted.value) as Partial<CdnDestinationSecret>;
    if (
      typeof parsed.accessKeyId !== "string" ||
      typeof parsed.secretAccessKey !== "string" ||
      parsed.accessKeyId.length === 0 ||
      parsed.secretAccessKey.length === 0
    ) {
      return err({ code: "crypto_failed" });
    }
    return ok({
      accessKeyId: parsed.accessKeyId,
      secretAccessKey: parsed.secretAccessKey,
      sessionToken: typeof parsed.sessionToken === "string" ? parsed.sessionToken : undefined,
    });
  } catch {
    return err({ code: "crypto_failed" });
  }
}

export function cdnDestinationToS3Location(
  row: OrganizationCdnDestination,
  secret: CdnDestinationSecret,
): OtaS3Location {
  return {
    bucket: row.bucket,
    region: row.region,
    endpoint: row.endpoint,
    usePathStyle: row.usePathStyle,
    credentials: secret,
  };
}

export async function listCdnDestinations(
  organizationId: string,
): Promise<CdnDestinationSummary[]> {
  const rows = await db
    .select()
    .from(schema.organizationCdnDestinations)
    .where(eq(schema.organizationCdnDestinations.organizationId, organizationId))
    .orderBy(desc(schema.organizationCdnDestinations.updatedAt));
  return rows.map(summarize);
}

export async function getCdnDestination(input: {
  organizationId: string;
  destinationId: string;
}): Promise<OrganizationCdnDestination | null> {
  const [row] = await db
    .select()
    .from(schema.organizationCdnDestinations)
    .where(
      and(
        eq(schema.organizationCdnDestinations.organizationId, input.organizationId),
        eq(schema.organizationCdnDestinations.id, input.destinationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function runProbe(
  location: OtaS3Location,
  probe: CreateCdnDestinationInput["probe"],
): Promise<Result<void, CdnDestinationWriterError>> {
  try {
    await (probe ?? probeOverrideForTests ?? probeS3Location)(location);
    return ok(undefined);
  } catch (error) {
    logger.error("cdn_destination_probe_failed", { error: serializeErrorForLog(error) });
    return err({
      code: "destination_probe_failed",
      message: "Could not access the S3 bucket with these credentials.",
    });
  }
}

export async function createCdnDestination(
  input: CreateCdnDestinationInput,
): Promise<Result<CdnDestinationSummary, CdnDestinationWriterError>> {
  const name = normalizeName(input.name);
  if (!name.ok) return name;
  const bucket = normalizeBucket(input.bucket);
  if (!bucket.ok) return bucket;
  const region = normalizeRegion(input.region);
  if (!region.ok) return region;
  const endpoint = normalizeEndpoint(input.endpoint);
  if (!endpoint.ok) return endpoint;
  const publicBaseUrl = normalizePublicBaseUrl(input.publicBaseUrl);
  if (!publicBaseUrl.ok) return publicBaseUrl;
  const secret = normalizeCredentials(input);
  if (!secret.ok) return secret;
  const encrypted = encryptSecret(secret.value);
  if (!encrypted.ok) return encrypted;

  const location = {
    bucket: bucket.value,
    region: region.value,
    endpoint: endpoint.value,
    usePathStyle: input.usePathStyle === true,
    credentials: secret.value,
  };
  const probed = await runProbe(location, input.probe);
  if (!probed.ok) return probed;

  try {
    const [row] = await db
      .insert(schema.organizationCdnDestinations)
      .values({
        organizationId: input.organizationId,
        name: name.value,
        bucket: bucket.value,
        region: region.value,
        endpoint: endpoint.value,
        publicBaseUrl: publicBaseUrl.value,
        usePathStyle: input.usePathStyle === true,
        ...encrypted.value,
        validationStatus: "valid",
        validationMessage: null,
        lastValidatedAt: new Date(),
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId,
      })
      .returning();

    if (!row) {
      return err({ code: "crypto_failed" });
    }
    return ok(summarize(row));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return err({ code: "destination_name_taken" });
    }
    throw error;
  }
}

export async function updateCdnDestination(
  input: UpdateCdnDestinationInput,
): Promise<Result<CdnDestinationSummary, CdnDestinationWriterError>> {
  const existing = await getCdnDestination({
    organizationId: input.organizationId,
    destinationId: input.destinationId,
  });
  if (!existing) {
    return err({ code: "destination_not_found" });
  }

  const patch: Partial<typeof schema.organizationCdnDestinations.$inferInsert> = {
    updatedByUserId: input.actorUserId,
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    const name = normalizeName(input.name);
    if (!name.ok) return name;
    patch.name = name.value;
  }
  if (input.bucket !== undefined) {
    const bucket = normalizeBucket(input.bucket);
    if (!bucket.ok) return bucket;
    patch.bucket = bucket.value;
  }
  if (input.region !== undefined) {
    const region = normalizeRegion(input.region);
    if (!region.ok) return region;
    patch.region = region.value;
  }
  if (input.endpoint !== undefined) {
    const endpoint = normalizeEndpoint(input.endpoint);
    if (!endpoint.ok) return endpoint;
    patch.endpoint = endpoint.value;
  }
  if (input.publicBaseUrl !== undefined) {
    const publicBaseUrl = normalizePublicBaseUrl(input.publicBaseUrl);
    if (!publicBaseUrl.ok) return publicBaseUrl;
    patch.publicBaseUrl = publicBaseUrl.value;
  }
  if (input.usePathStyle !== undefined) {
    patch.usePathStyle = input.usePathStyle;
  }

  let secret: CdnDestinationSecret | null = null;
  if (input.accessKeyId !== undefined || input.secretAccessKey !== undefined) {
    const decrypted = decryptCdnDestinationSecret(existing);
    if (!decrypted.ok) return decrypted;
    const next = normalizeCredentials({
      accessKeyId: input.accessKeyId ?? decrypted.value.accessKeyId,
      secretAccessKey: input.secretAccessKey ?? decrypted.value.secretAccessKey,
      sessionToken:
        input.sessionToken === undefined ? decrypted.value.sessionToken : input.sessionToken,
    });
    if (!next.ok) return next;
    const encrypted = encryptSecret(next.value);
    if (!encrypted.ok) return encrypted;
    Object.assign(patch, encrypted.value);
    secret = next.value;
  } else {
    const decrypted = decryptCdnDestinationSecret(existing);
    if (!decrypted.ok) return decrypted;
    secret = decrypted.value;
  }

  const location: OtaS3Location = {
    bucket: (patch.bucket as string | undefined) ?? existing.bucket,
    region: (patch.region as string | undefined) ?? existing.region,
    endpoint: (patch.endpoint as string | null | undefined) ?? existing.endpoint,
    usePathStyle:
      typeof patch.usePathStyle === "boolean" ? patch.usePathStyle : existing.usePathStyle,
    credentials: secret,
  };
  const probed = await runProbe(location, input.probe);
  if (!probed.ok) return probed;
  patch.validationStatus = "valid";
  patch.validationMessage = null;
  patch.lastValidatedAt = new Date();

  try {
    const [updated] = await db
      .update(schema.organizationCdnDestinations)
      .set(patch)
      .where(eq(schema.organizationCdnDestinations.id, existing.id))
      .returning();

    if (!updated) {
      return err({ code: "destination_not_found" });
    }
    return ok(summarize(updated));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return err({ code: "destination_name_taken" });
    }
    throw error;
  }
}

export async function deleteCdnDestination(input: {
  organizationId: string;
  destinationId: string;
}): Promise<Result<void, CdnDestinationWriterError>> {
  const existing = await getCdnDestination(input);
  if (!existing) {
    return err({ code: "destination_not_found" });
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.otaDistributions)
    .where(eq(schema.otaDistributions.destinationId, existing.id));

  if ((count ?? 0) > 0) {
    return err({ code: "destination_in_use" });
  }

  await db
    .delete(schema.organizationCdnDestinations)
    .where(eq(schema.organizationCdnDestinations.id, existing.id));
  return ok(undefined);
}
