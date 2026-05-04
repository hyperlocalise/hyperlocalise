import { createHash, randomUUID } from "node:crypto";

import { and, eq, isNull, or, type SQL } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import { getFileStorageAdapter, type FileStorageAdapter } from ".";

type StoredFileRole = (typeof schema.storedFileRoleEnum.enumValues)[number];
type StoredFileSourceKind = (typeof schema.storedFileSourceKindEnum.enumValues)[number];

type CreateStoredFileInput = {
  organizationId: string;
  projectId?: string | null;
  createdByUserId?: string | null;
  role: StoredFileRole;
  sourceKind: StoredFileSourceKind;
  sourceInteractionId?: string | null;
  sourceJobId?: string | null;
  filename: string;
  contentType: string;
  content: Buffer | Uint8Array | ArrayBuffer;
  metadata?: Record<string, unknown>;
  adapter?: FileStorageAdapter;
};

type StoredFileScopeInput = {
  organizationId: string;
  projectId?: string | null;
  fileId: string;
};

function createStoredFileId() {
  return `file_${randomUUID()}`;
}

function safePathPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function bytesFromContent(content: Buffer | Uint8Array | ArrayBuffer) {
  if (Buffer.isBuffer(content)) {
    return content;
  }

  if (content instanceof ArrayBuffer) {
    return Buffer.from(content);
  }

  return Buffer.from(content.buffer, content.byteOffset, content.byteLength);
}

function storageKey(input: {
  organizationId: string;
  projectId?: string | null;
  id: string;
  filename: string;
}) {
  const scope = input.projectId ? `projects/${safePathPart(input.projectId)}` : "workspace";
  return [
    "organizations",
    safePathPart(input.organizationId),
    scope,
    "files",
    input.id,
    safePathPart(input.filename),
  ].join("/");
}

export async function createStoredFile(input: CreateStoredFileInput) {
  const adapter = input.adapter ?? getFileStorageAdapter();
  const id = createStoredFileId();
  const content = bytesFromContent(input.content);
  const key = storageKey({
    organizationId: input.organizationId,
    projectId: input.projectId,
    id,
    filename: input.filename,
  });
  const uploaded = await adapter.put({
    key,
    body: content,
    contentType: input.contentType,
  });

  const [file] = await db
    .insert(schema.storedFiles)
    .values({
      id,
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      createdByUserId: input.createdByUserId ?? null,
      role: input.role,
      sourceKind: input.sourceKind,
      sourceInteractionId: input.sourceInteractionId ?? null,
      sourceJobId: input.sourceJobId ?? null,
      storageProvider: uploaded.provider,
      storageKey: uploaded.key,
      storageUrl: uploaded.url,
      downloadUrl: uploaded.downloadUrl,
      filename: input.filename,
      contentType: uploaded.contentType,
      byteSize: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex"),
      etag: uploaded.etag,
      metadata: input.metadata ?? {},
    })
    .returning();

  if (!file) {
    throw new Error("Failed to create stored file: no row returned.");
  }

  return file;
}

export async function getStoredFileForJobScope(input: StoredFileScopeInput) {
  const filters: SQL[] = [
    eq(schema.storedFiles.id, input.fileId),
    eq(schema.storedFiles.organizationId, input.organizationId),
  ];

  if (input.projectId) {
    const projectScope = or(
      eq(schema.storedFiles.projectId, input.projectId),
      isNull(schema.storedFiles.projectId),
    );
    if (projectScope) {
      filters.push(projectScope);
    }
  }

    .select()
    .from(schema.storedFiles)
    .where(and(...filters))
    .limit(1);

  return file ?? null;
}
