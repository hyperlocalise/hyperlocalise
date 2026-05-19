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

type RepositorySourceFileVersionInput = {
  storedFile: typeof schema.storedFiles.$inferSelect;
  sourcePath: string;
  sourceHash?: string | null;
  commitSha?: string | null;
  workflowRunId?: string | null;
  uploadedByUserId?: string | null;
  uploadedByApiKeyId?: string | null;
  uploadSurface?: string | null;
};

export function createStoredFileId() {
  return `file_${crypto.randomUUID()}`;
}

export async function sha256Hex(content: Buffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength,
    ) as ArrayBuffer,
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function safePathPart(value: string) {
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

export function storageKey(input: {
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

  try {
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
        sha256: await sha256Hex(content),
        etag: uploaded.etag,
        metadata: input.metadata ?? {},
      })
      .returning();

    if (!file) {
      throw new Error("Failed to create stored file: no row returned.");
    }

    return file;
  } catch (error) {
    await adapter.delete({ keyOrUrl: uploaded.key });
    throw error;
  }
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

  const [file] = await db
    .select()
    .from(schema.storedFiles)
    .where(and(...filters))
    .limit(1);

  return file ?? null;
}

function stringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export async function createRepositorySourceFileVersion(input: RepositorySourceFileVersionInput) {
  if (!input.storedFile.projectId) {
    throw new Error("Repository source files must belong to a project.");
  }

  const [sourceFile] = await db
    .insert(schema.repositorySourceFiles)
    .values({
      organizationId: input.storedFile.organizationId,
      projectId: input.storedFile.projectId,
      sourcePath: input.sourcePath,
    })
    .onConflictDoUpdate({
      target: [schema.repositorySourceFiles.projectId, schema.repositorySourceFiles.sourcePath],
      set: { updatedAt: new Date() },
    })
    .returning();

  if (!sourceFile) {
    throw new Error("Failed to create repository source file: no row returned.");
  }

  const [version] = await db
    .insert(schema.repositorySourceFileVersions)
    .values({
      repositorySourceFileId: sourceFile.id,
      organizationId: input.storedFile.organizationId,
      projectId: input.storedFile.projectId,
      sourcePath: input.sourcePath,
      storedFileId: input.storedFile.id,
      sourceHash: input.sourceHash ?? input.storedFile.sha256,
      commitSha: input.commitSha ?? null,
      workflowRunId: input.workflowRunId ?? null,
      uploadedByUserId: input.uploadedByUserId ?? input.storedFile.createdByUserId,
      uploadedByApiKeyId: input.uploadedByApiKeyId ?? null,
      uploadSurface: input.uploadSurface ?? null,
    })
    .onConflictDoUpdate({
      target: schema.repositorySourceFileVersions.storedFileId,
      set: {
        repositorySourceFileId: sourceFile.id,
        organizationId: input.storedFile.organizationId,
        projectId: input.storedFile.projectId,
        sourcePath: input.sourcePath,
        sourceHash: input.sourceHash ?? input.storedFile.sha256,
        commitSha: input.commitSha ?? null,
        workflowRunId: input.workflowRunId ?? null,
        uploadedByUserId: input.uploadedByUserId ?? input.storedFile.createdByUserId,
        uploadedByApiKeyId: input.uploadedByApiKeyId ?? null,
        uploadSurface: input.uploadSurface ?? null,
      },
    })
    .returning();

  if (!version) {
    throw new Error("Failed to create repository source file version: no row returned.");
  }

  return version;
}

export async function getRepositorySourceFileVersionForStoredFile(input: StoredFileScopeInput) {
  const [version] = await db
    .select()
    .from(schema.repositorySourceFileVersions)
    .where(
      and(
        eq(schema.repositorySourceFileVersions.storedFileId, input.fileId),
        eq(schema.repositorySourceFileVersions.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (version) {
    return version;
  }

  const file = await getStoredFileForJobScope(input);
  if (!file || file.sourceKind !== "repository_file" || !file.projectId) {
    return null;
  }

  const sourcePath = stringMetadata(file.metadata, "sourcePath");
  if (!sourcePath) {
    return null;
  }

  return createRepositorySourceFileVersion({
    storedFile: file,
    sourcePath,
    sourceHash: stringMetadata(file.metadata, "sourceHash"),
    commitSha: stringMetadata(file.metadata, "commitSha"),
    workflowRunId: stringMetadata(file.metadata, "workflowRunId"),
    uploadedByUserId: file.createdByUserId,
    uploadSurface: stringMetadata(file.metadata, "uploadSurface"),
  });
}
