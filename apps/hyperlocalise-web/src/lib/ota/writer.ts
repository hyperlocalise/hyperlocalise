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
import { and, eq, inArray, isNull, max } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";
import type { OtaDistribution, OtaDistributionFormat, OtaRelease } from "@/lib/database/types";
import type { OtaManifestSnapshot } from "@/lib/database/schema/ota";
import { canonicalizeLocale } from "@/lib/i18n/locales";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import { generateOtaPublicHash } from "./public-hash";

const OTA_DISTRIBUTION_NAME_MAX_LENGTH = 120;
const OTA_PUBLIC_HASH_INSERT_ATTEMPTS = 5;
const OTA_DISTRIBUTION_FORMATS = new Set<OtaDistributionFormat>([
  "json",
  "android_xml",
  "ios_strings",
]);

export type OtaDistributionWriterError =
  | { code: "project_not_found" }
  | { code: "not_native_project" }
  | { code: "distribution_not_found" }
  | { code: "revoked" }
  | { code: "invalid_name" }
  | { code: "invalid_format" }
  | { code: "empty_file_ids" }
  | { code: "empty_locales" }
  | { code: "unknown_file_ids"; fileIds: string[] }
  | { code: "invalid_locales"; locales: string[] }
  | { code: "locales_not_in_project"; locales: string[] }
  | { code: "hash_collision" };

export type CreateOtaDistributionInput = {
  projectId: string;
  name: string;
  fileIds: readonly string[];
  locales: readonly string[];
  format: OtaDistributionFormat;
  actorUserId: string;
  db?: DatabaseClient;
};

export type UpdateOtaDistributionInput = {
  distributionId: string;
  actorUserId: string;
  name?: string;
  fileIds?: readonly string[];
  locales?: readonly string[];
  format?: OtaDistributionFormat;
  db?: DatabaseClient;
};

export type ReleaseOtaDistributionInput = {
  distributionId: string;
  actorUserId: string;
  artifactPointer?: string | null;
  manifest?: Partial<OtaManifestSnapshot>;
  db?: DatabaseClient;
};

export type RevokeOtaDistributionInput = {
  distributionId: string;
  actorUserId: string;
  db?: DatabaseClient;
};

type NativeProjectRow = {
  id: string;
  organizationId: string;
  source: "native" | "external_tms";
  sourceLocale: string | null;
  targetLocales: string[];
};

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

function uniquePreservingOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function normalizeName(name: string): Result<string, OtaDistributionWriterError> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > OTA_DISTRIBUTION_NAME_MAX_LENGTH) {
    return err({ code: "invalid_name" });
  }
  return ok(trimmed);
}

function normalizeFormat(
  format: OtaDistributionFormat,
): Result<OtaDistributionFormat, OtaDistributionWriterError> {
  if (!OTA_DISTRIBUTION_FORMATS.has(format)) {
    return err({ code: "invalid_format" });
  }
  return ok(format);
}

function normalizeLocales(
  locales: readonly string[],
): Result<string[], OtaDistributionWriterError> {
  const invalid: string[] = [];
  const canonical: string[] = [];
  for (const locale of locales) {
    const normalized = canonicalizeLocale(locale);
    if (!normalized) {
      invalid.push(locale);
      continue;
    }
    canonical.push(normalized);
  }

  if (invalid.length > 0) {
    return err({ code: "invalid_locales", locales: invalid });
  }

  const unique = uniquePreservingOrder(canonical);
  if (unique.length === 0) {
    return err({ code: "empty_locales" });
  }

  return ok(unique);
}

function projectLocaleSet(project: NativeProjectRow): Set<string> {
  const locales = new Set<string>();
  if (project.sourceLocale) {
    const source = canonicalizeLocale(project.sourceLocale) ?? project.sourceLocale;
    locales.add(source);
  }
  for (const locale of project.targetLocales) {
    locales.add(canonicalizeLocale(locale) ?? locale);
  }
  return locales;
}

function assertLocalesOnProject(
  project: NativeProjectRow,
  locales: readonly string[],
): Result<void, OtaDistributionWriterError> {
  const allowed = projectLocaleSet(project);
  const missing = locales.filter((locale) => !allowed.has(locale));
  if (missing.length > 0) {
    return err({ code: "locales_not_in_project", locales: missing });
  }
  return ok(undefined);
}

function normalizeFileIds(
  fileIds: readonly string[],
): Result<string[], OtaDistributionWriterError> {
  const unique = uniquePreservingOrder(
    fileIds.map((id) => id.trim()).filter((id) => id.length > 0),
  );
  if (unique.length === 0) {
    return err({ code: "empty_file_ids" });
  }
  return ok(unique);
}

function manifestFilePath(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `/${normalized}`;
}

function unixTimestampSeconds(date = new Date()): number {
  return Math.floor(date.getTime() / 1000);
}

function buildManifestSnapshot(input: {
  filePaths: readonly string[];
  locales: readonly string[];
  format: OtaDistributionFormat;
  override?: Partial<OtaManifestSnapshot>;
}): OtaManifestSnapshot {
  const files = input.override?.files ?? input.filePaths.map(manifestFilePath);
  const languages = input.override?.languages ?? [...input.locales];
  const content =
    input.override?.content ??
    Object.fromEntries(
      languages.map((locale) => [locale, files.map((file) => `/content/${locale}${file}`)]),
    );
  const timestamp = input.override?.timestamp ?? unixTimestampSeconds();
  const format = input.override?.format ?? input.format;

  return { files, languages, content, timestamp, format };
}

async function loadNativeProject(
  projectId: string,
  client: DatabaseClient,
): Promise<Result<NativeProjectRow, OtaDistributionWriterError>> {
  const [project] = await client
    .select({
      id: schema.projects.id,
      organizationId: schema.projects.organizationId,
      source: schema.projects.source,
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);

  if (!project) {
    return err({ code: "project_not_found" });
  }

  if (project.source !== "native") {
    return err({ code: "not_native_project" });
  }

  return ok(project);
}

async function assertProjectFileIds(
  projectId: string,
  organizationId: string,
  fileIds: readonly string[],
  client: DatabaseClient,
): Promise<Result<void, OtaDistributionWriterError>> {
  const rows = await client
    .select({ id: schema.repositorySourceFiles.id })
    .from(schema.repositorySourceFiles)
    .where(
      and(
        eq(schema.repositorySourceFiles.projectId, projectId),
        eq(schema.repositorySourceFiles.organizationId, organizationId),
        inArray(schema.repositorySourceFiles.id, [...fileIds]),
      ),
    );

  const found = new Set(rows.map((row) => row.id));
  const missing = fileIds.filter((fileId) => !found.has(fileId));
  if (missing.length > 0) {
    return err({ code: "unknown_file_ids", fileIds: missing });
  }

  return ok(undefined);
}

async function loadSourcePathsByFileId(
  projectId: string,
  fileIds: readonly string[],
  client: DatabaseClient,
): Promise<string[]> {
  if (fileIds.length === 0) {
    return [];
  }

  const rows = await client
    .select({
      id: schema.repositorySourceFiles.id,
      sourcePath: schema.repositorySourceFiles.sourcePath,
    })
    .from(schema.repositorySourceFiles)
    .where(
      and(
        eq(schema.repositorySourceFiles.projectId, projectId),
        inArray(schema.repositorySourceFiles.id, [...fileIds]),
      ),
    );

  const pathById = new Map(rows.map((row) => [row.id, row.sourcePath]));
  return fileIds.flatMap((fileId) => {
    const sourcePath = pathById.get(fileId);
    return sourcePath ? [sourcePath] : [];
  });
}

async function insertDistributionWithUniqueHash(
  client: DatabaseClient,
  values: Omit<typeof schema.otaDistributions.$inferInsert, "publicHash">,
): Promise<Result<OtaDistribution, OtaDistributionWriterError>> {
  for (let attempt = 0; attempt < OTA_PUBLIC_HASH_INSERT_ATTEMPTS; attempt += 1) {
    try {
      const [row] = await client
        .insert(schema.otaDistributions)
        .values({
          ...values,
          publicHash: generateOtaPublicHash(),
        })
        .returning();

      if (!row) {
        return err({ code: "hash_collision" });
      }

      return ok(row);
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === OTA_PUBLIC_HASH_INSERT_ATTEMPTS - 1) {
        if (isUniqueViolation(error)) {
          return err({ code: "hash_collision" });
        }
        throw error;
      }
    }
  }

  return err({ code: "hash_collision" });
}

export async function createOtaDistribution(
  input: CreateOtaDistributionInput,
): Promise<Result<OtaDistribution, OtaDistributionWriterError>> {
  const client = input.db ?? db;
  const name = normalizeName(input.name);
  if (!name.ok) {
    return name;
  }

  const format = normalizeFormat(input.format);
  if (!format.ok) {
    return format;
  }

  const fileIds = normalizeFileIds(input.fileIds);
  if (!fileIds.ok) {
    return fileIds;
  }

  const locales = normalizeLocales(input.locales);
  if (!locales.ok) {
    return locales;
  }

  const project = await loadNativeProject(input.projectId, client);
  if (!project.ok) {
    return project;
  }

  const localesOnProject = assertLocalesOnProject(project.value, locales.value);
  if (!localesOnProject.ok) {
    return localesOnProject;
  }

  const filesOnProject = await assertProjectFileIds(
    project.value.id,
    project.value.organizationId,
    fileIds.value,
    client,
  );
  if (!filesOnProject.ok) {
    return filesOnProject;
  }

  return insertDistributionWithUniqueHash(client, {
    organizationId: project.value.organizationId,
    projectId: project.value.id,
    name: name.value,
    fileIds: fileIds.value,
    locales: locales.value,
    format: format.value,
    createdByUserId: input.actorUserId,
    updatedByUserId: input.actorUserId,
  });
}

export async function updateOtaDistribution(
  input: UpdateOtaDistributionInput,
): Promise<Result<OtaDistribution, OtaDistributionWriterError>> {
  const client = input.db ?? db;

  const [distribution] = await client
    .select()
    .from(schema.otaDistributions)
    .where(eq(schema.otaDistributions.id, input.distributionId))
    .limit(1);

  if (!distribution) {
    return err({ code: "distribution_not_found" });
  }

  if (distribution.revokedAt) {
    return err({ code: "revoked" });
  }

  const patch: Partial<typeof schema.otaDistributions.$inferInsert> = {
    updatedByUserId: input.actorUserId,
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    const name = normalizeName(input.name);
    if (!name.ok) {
      return name;
    }
    patch.name = name.value;
  }

  if (input.format !== undefined) {
    const format = normalizeFormat(input.format);
    if (!format.ok) {
      return format;
    }
    patch.format = format.value;
  }

  const project =
    input.fileIds !== undefined || input.locales !== undefined
      ? await loadNativeProject(distribution.projectId, client)
      : null;

  if (project && !project.ok) {
    return project;
  }

  if (input.fileIds !== undefined) {
    const fileIds = normalizeFileIds(input.fileIds);
    if (!fileIds.ok) {
      return fileIds;
    }
    const filesOnProject = await assertProjectFileIds(
      distribution.projectId,
      distribution.organizationId,
      fileIds.value,
      client,
    );
    if (!filesOnProject.ok) {
      return filesOnProject;
    }
    patch.fileIds = fileIds.value;
  }

  if (input.locales !== undefined) {
    const locales = normalizeLocales(input.locales);
    if (!locales.ok) {
      return locales;
    }
    if (project?.ok) {
      const localesOnProject = assertLocalesOnProject(project.value, locales.value);
      if (!localesOnProject.ok) {
        return localesOnProject;
      }
    }
    patch.locales = locales.value;
  }

  const [updated] = await client
    .update(schema.otaDistributions)
    .set(patch)
    .where(
      and(
        eq(schema.otaDistributions.id, distribution.id),
        isNull(schema.otaDistributions.revokedAt),
      ),
    )
    .returning();

  if (!updated) {
    return err({ code: "revoked" });
  }

  return ok(updated);
}

export async function revokeOtaDistribution(
  input: RevokeOtaDistributionInput,
): Promise<Result<OtaDistribution, OtaDistributionWriterError>> {
  const client = input.db ?? db;

  return client.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(schema.otaDistributions)
      .where(eq(schema.otaDistributions.id, input.distributionId))
      .for("update")
      .limit(1);

    if (!locked) {
      return err({ code: "distribution_not_found" });
    }

    if (locked.revokedAt) {
      return ok(locked);
    }

    const revokedAt = new Date();
    const [updated] = await tx
      .update(schema.otaDistributions)
      .set({
        revokedAt,
        updatedByUserId: input.actorUserId,
        updatedAt: revokedAt,
      })
      .where(
        and(eq(schema.otaDistributions.id, locked.id), isNull(schema.otaDistributions.revokedAt)),
      )
      .returning();

    if (updated) {
      return ok(updated);
    }

    const [persisted] = await tx
      .select()
      .from(schema.otaDistributions)
      .where(eq(schema.otaDistributions.id, input.distributionId))
      .limit(1);

    return persisted ? ok(persisted) : err({ code: "distribution_not_found" });
  });
}

export async function releaseOtaDistribution(
  input: ReleaseOtaDistributionInput,
): Promise<Result<OtaRelease, OtaDistributionWriterError>> {
  const client = input.db ?? db;

  return client.transaction(async (tx) => {
    const [distribution] = await tx
      .select()
      .from(schema.otaDistributions)
      .where(eq(schema.otaDistributions.id, input.distributionId))
      .for("update")
      .limit(1);

    if (!distribution) {
      return err({ code: "distribution_not_found" });
    }

    if (distribution.revokedAt) {
      return err({ code: "revoked" });
    }

    const filePaths = await loadSourcePathsByFileId(
      distribution.projectId,
      distribution.fileIds,
      tx,
    );
    const manifest = buildManifestSnapshot({
      filePaths,
      locales: distribution.locales,
      format: distribution.format,
      override: input.manifest,
    });

    const [latest] = await tx
      .select({ sequence: max(schema.otaReleases.sequence) })
      .from(schema.otaReleases)
      .where(eq(schema.otaReleases.distributionId, distribution.id));

    const sequence = (latest?.sequence ?? 0) + 1;
    const artifactPointer = input.artifactPointer?.trim() || null;

    const [release] = await tx
      .insert(schema.otaReleases)
      .values({
        organizationId: distribution.organizationId,
        distributionId: distribution.id,
        sequence,
        artifactPointer,
        manifest,
        releasedByUserId: input.actorUserId,
      })
      .returning();

    if (!release) {
      throw new Error("Failed to insert OTA release: no row returned.");
    }

    return ok(release);
  });
}

export const otaDistributionWriter = {
  create: createOtaDistribution,
  update: updateOtaDistribution,
  release: releaseOtaDistribution,
  revoke: revokeOtaDistribution,
};
