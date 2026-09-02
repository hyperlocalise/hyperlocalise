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
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { OrganizationMembershipRole } from "@/lib/database/types";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { hashApiKey } from "@/lib/security/api-keys";

const createdWorkosOrganizationIds = new Set<string>();
const createdWorkosUserIds = new Set<string>();

export { hashApiKey };

export async function createPublicApiFixture(options?: {
  permissions?: string[];
  role?: OrganizationMembershipRole;
}) {
  const suffix = randomUUID();
  const workosOrganizationId = `org_${suffix}`;
  const workosUserId = `user_${suffix}`;
  const apiKey = `hl_${suffix.replaceAll("-", "")}`;

  createdWorkosOrganizationIds.add(workosOrganizationId);
  createdWorkosUserIds.add(workosUserId);

  const [organization] = await db
    .insert(schema.organizations)
    .values({
      workosOrganizationId,
      name: `Example Org ${suffix}`,
      slug: `example-org-${suffix}`,
    })
    .returning();

  const [user] = await db
    .insert(schema.users)
    .values({
      workosUserId,
      email: `${suffix}@example.com`,
    })
    .returning();

  await db.insert(schema.organizationMemberships).values({
    organizationId: organization.id,
    userId: user.id,
    role: options?.role ?? "admin",
    workosMembershipId: `om_${suffix}`,
  });

  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${suffix}`,
      identifier: uniqueTestProjectIdentifier(),
      organizationId: organization.id,
      createdByUserId: user.id,
      name: "Marketing Site",
      description: "Primary website strings",
      translationContext: "Use concise product-marketing language.",
    })
    .returning();

  const [apiKeyRow] = await db
    .insert(schema.organizationApiKeys)
    .values({
      organizationId: organization.id,
      name: "Public API Test Key",
      keyHash: hashApiKey(apiKey),
      keyPrefix: apiKey.slice(0, 8),
      permissions: options?.permissions ?? ["jobs:read", "jobs:write"],
      createdByUserId: user.id,
    })
    .returning({ id: schema.organizationApiKeys.id });

  if (!apiKeyRow) {
    throw new Error("api key insert failed");
  }

  return { apiKey, apiKeyId: apiKeyRow.id, project, user };
}

export async function insertStoredSourceFile(params: {
  projectId: string;
  organizationId: string;
  filename?: string;
  contentType?: string;
  sourceKind?: (typeof schema.storedFileSourceKindEnum.enumValues)[number];
  metadata?: Record<string, unknown>;
}) {
  const id = `file_${randomUUID()}`;
  const filename = params.filename ?? "source.xliff";
  const [file] = await db
    .insert(schema.storedFiles)
    .values({
      id,
      organizationId: params.organizationId,
      projectId: params.projectId,
      role: "source",
      sourceKind: params.sourceKind ?? "chat_upload",
      storageProvider: "vercel_blob",
      storageKey: `test/${id}/${filename}`,
      storageUrl: `https://example.com/${id}/${filename}`,
      downloadUrl: `https://example.com/${id}/${filename}?download=1`,
      filename,
      contentType: params.contentType ?? "application/xliff+xml",
      byteSize: 2,
      sha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
      metadata: params.metadata ?? {},
    })
    .returning();

  if (!file) {
    throw new Error("stored file insert failed");
  }

  return file;
}

export async function insertPublicTranslationJob(params: {
  projectId: string;
  organizationId: string;
  apiKeyId?: string;
  status: (typeof schema.jobStatusEnum.enumValues)[number];
  type?: "string" | "file";
  lastError?: string | null;
  completedAt?: Date | null;
  outputFiles?: Array<{ fileId: string; locale: string; filename: string }>;
}) {
  return db.transaction(async (tx) => {
    const id = `job_${randomUUID()}`;
    const type = params.type ?? (params.outputFiles ? "file" : "string");
    const outputFiles = params.outputFiles ?? [];
    const [job] = await tx
      .insert(schema.jobs)
      .values({
        id,
        organizationId: params.organizationId,
        projectId: params.projectId,
        kind: "translation",
        status: params.status,
        inputPayload:
          type === "file"
            ? {
                sourceFileId: "file_source",
                fileFormat: "xliff",
                sourceLocale: "en-US",
                targetLocales: outputFiles.map((file) => file.locale),
              }
            : {
                sourceText: "Hello world",
                sourceLocale: "en-US",
                targetLocales: ["fr-FR"],
              },
        outcomePayload: outputFiles.length > 0 ? { outputFiles } : null,
        lastError: params.lastError ?? null,
        apiKeyId: params.apiKeyId ?? null,
        completedAt: params.completedAt ?? (params.status === "succeeded" ? new Date() : null),
      })
      .returning();

    if (!job) {
      throw new Error("job insert failed");
    }

    await tx.insert(schema.translationJobDetails).values({
      jobId: id,
      type,
      outcomeKind: outputFiles.length > 0 ? "file_result" : null,
    });

    return job;
  });
}

export async function insertCompletedPublicFileJob(params: {
  projectId: string;
  organizationId: string;
  apiKeyId?: string;
  outputFiles: Array<{ fileId: string; locale: string; filename: string }>;
}) {
  return insertPublicTranslationJob({
    ...params,
    status: "succeeded",
    type: "file",
    outputFiles: params.outputFiles,
  });
}

export async function insertRepositoryPublicFileJob(params: {
  projectId: string;
  organizationId: string;
  sourcePath: string;
  sourceHash: string;
  status: (typeof schema.jobStatusEnum.enumValues)[number];
  versionCreatedAt: Date;
  jobCreatedAt: Date;
  completedAt?: Date | null;
  outputFiles?: Array<{ fileId: string; locale: string; filename: string }>;
}) {
  return db.transaction(async (tx) => {
    const storedFileId = `file_${randomUUID()}`;
    const jobId = `job_${randomUUID()}`;
    const filename = params.sourcePath.split("/").at(-1) ?? "source.xliff";
    const outputFiles = params.outputFiles ?? [];

    const [storedFile] = await tx
      .insert(schema.storedFiles)
      .values({
        id: storedFileId,
        organizationId: params.organizationId,
        projectId: params.projectId,
        role: "source",
        sourceKind: "repository_file",
        storageProvider: "vercel_blob",
        storageKey: `test/${storedFileId}/${filename}`,
        storageUrl: `https://example.com/${storedFileId}/${filename}`,
        downloadUrl: `https://example.com/${storedFileId}/${filename}?download=1`,
        filename,
        contentType: "application/xliff+xml",
        byteSize: 2,
        sha256: params.sourceHash,
        metadata: {
          sourcePath: params.sourcePath,
          sourceHash: params.sourceHash,
          uploadSurface: "public_api",
        },
        createdAt: params.versionCreatedAt,
      })
      .returning();

    if (!storedFile) {
      throw new Error("stored file insert failed");
    }

    const [sourceFile] = await tx
      .insert(schema.repositorySourceFiles)
      .values({
        organizationId: params.organizationId,
        projectId: params.projectId,
        sourcePath: params.sourcePath,
        createdAt: params.versionCreatedAt,
      })
      .onConflictDoUpdate({
        target: [schema.repositorySourceFiles.projectId, schema.repositorySourceFiles.sourcePath],
        set: { updatedAt: params.versionCreatedAt },
      })
      .returning();

    if (!sourceFile) {
      throw new Error("repository source file insert failed");
    }

    const [version] = await tx
      .insert(schema.repositorySourceFileVersions)
      .values({
        repositorySourceFileId: sourceFile.id,
        organizationId: params.organizationId,
        projectId: params.projectId,
        sourcePath: params.sourcePath,
        storedFileId,
        sourceHash: params.sourceHash,
        uploadSurface: "public_api",
        createdAt: params.versionCreatedAt,
      })
      .returning();

    if (!version) {
      throw new Error("repository source file version insert failed");
    }

    const [job] = await tx
      .insert(schema.jobs)
      .values({
        id: jobId,
        organizationId: params.organizationId,
        projectId: params.projectId,
        kind: "translation",
        status: params.status,
        inputPayload: {
          sourceFileId: storedFileId,
          fileFormat: "xliff",
          sourceLocale: "en-US",
          targetLocales: outputFiles.map((file) => file.locale),
        },
        outcomePayload:
          params.status === "succeeded"
            ? {
                outputFiles,
              }
            : null,
        completedAt: params.completedAt ?? null,
        createdAt: params.jobCreatedAt,
      })
      .returning();

    if (!job) {
      throw new Error("job insert failed");
    }

    await tx.insert(schema.translationJobDetails).values({
      jobId,
      type: "file",
      sourceFileVersionId: version.id,
      outcomeKind: params.status === "succeeded" ? "file_result" : null,
    });

    return job;
  });
}

export async function cleanupPublicApiFixture() {
  for (const workosOrganizationId of createdWorkosOrganizationIds) {
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.workosOrganizationId, workosOrganizationId));
  }

  for (const workosUserId of createdWorkosUserIds) {
    await db.delete(schema.users).where(eq(schema.users.workosUserId, workosUserId));
  }

  createdWorkosOrganizationIds.clear();
  createdWorkosUserIds.clear();
}
