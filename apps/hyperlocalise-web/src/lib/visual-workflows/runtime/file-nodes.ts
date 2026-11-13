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
import { and, eq } from "drizzle-orm";
import { parseDocument, stringify as stringifyYaml } from "yaml";

import { db, schema } from "@/lib/database/client";
import { getFileStorageAdapter } from "@/lib/file-storage/get-file-storage-adapter";
import { createStoredFile, getStoredFileForJobScope, sha256Hex } from "@/lib/file-storage/records";
import type { GetStoredObjectResult } from "@/lib/file-storage/types";

import type { VisualWorkflowNodeExecutionResult } from "./execution-result";

export const VISUAL_WORKFLOW_FILE_MAX_BYTES = 5 * 1024 * 1024;

type StoredFileForRead = {
  id: string;
  storageKey: string;
  filename: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  metadata: Record<string, unknown>;
};

type FileActor = { userId: string; projectId: string | null };

type ResolveFileActor = (input: {
  organizationId: string;
  visualWorkflowId: string;
}) => Promise<FileActor | null>;

export type FileReadDependencies = {
  resolveActor: ResolveFileActor;
  findFile(input: {
    organizationId: string;
    projectId?: string | null;
    fileId: string;
  }): Promise<StoredFileForRead | null>;
  getObject(input: { keyOrUrl: string }): Promise<GetStoredObjectResult | null>;
};

type StoredFileForWrite = {
  id: string;
  filename: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  metadata: Record<string, unknown>;
};

export type FileWriteDependencies = {
  resolveActor: ResolveFileActor;
  findFile(input: {
    organizationId: string;
    projectId?: string | null;
    fileId: string;
  }): Promise<StoredFileForWrite | null>;
  createFile(input: {
    id: string;
    organizationId: string;
    projectId: string | null;
    createdByUserId: string;
    filename: string;
    contentType: string;
    content: Buffer;
    metadata: Record<string, unknown>;
  }): Promise<StoredFileForWrite>;
};

export type FileConvertDependencies = Omit<FileReadDependencies, "findFile"> &
  Omit<FileWriteDependencies, "findFile"> & {
    findFile(input: {
      organizationId: string;
      projectId?: string | null;
      fileId: string;
    }): Promise<(StoredFileForRead & StoredFileForWrite) | null>;
  };

const resolveWorkflowFileActor: ResolveFileActor = async (input) => {
  const [actor] = await db
    .select({
      userId: schema.visualWorkflows.authorUserId,
      projectId: schema.visualWorkflows.projectId,
    })
    .from(schema.visualWorkflows)
    .innerJoin(
      schema.organizationMemberships,
      and(
        eq(schema.organizationMemberships.organizationId, input.organizationId),
        eq(schema.organizationMemberships.userId, schema.visualWorkflows.authorUserId),
      ),
    )
    .where(
      and(
        eq(schema.visualWorkflows.id, input.visualWorkflowId),
        eq(schema.visualWorkflows.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  return actor?.userId ? { userId: actor.userId, projectId: actor.projectId } : null;
};

const defaultFileReadDependencies: FileReadDependencies = {
  resolveActor: resolveWorkflowFileActor,
  findFile: (input) => getStoredFileForJobScope(input),
  getObject: (input) => getFileStorageAdapter().get(input),
};

const defaultFileWriteDependencies: FileWriteDependencies = {
  resolveActor: resolveWorkflowFileActor,
  findFile: (input) => getStoredFileForJobScope(input),
  createFile: (input) =>
    createStoredFile({
      ...input,
      role: "output",
      sourceKind: "job_output",
    }),
};

function fileReadError(code: string, message: string): VisualWorkflowNodeExecutionResult {
  return { ok: true, output: { error: { code, message } }, switchCase: "error" };
}

function fileWriteError(code: string, message: string): VisualWorkflowNodeExecutionResult {
  return { ok: true, output: { error: { code, message } }, switchCase: "error" };
}

function decodeFileContent(
  content: string,
  encoding: "utf-8" | "base64",
): { ok: true; content: Buffer } | { ok: false } {
  if (encoding === "utf-8") return { ok: true, content: Buffer.from(content, "utf8") };
  if (
    content.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)
  ) {
    return { ok: false };
  }
  return { ok: true, content: Buffer.from(content, "base64") };
}

function validFilename(filename: string) {
  return (
    filename.length > 0 &&
    filename !== "." &&
    filename !== ".." &&
    !filename.includes("/") &&
    !filename.includes("\\") &&
    !filename.includes("\0")
  );
}

function validContentType(contentType: string) {
  const isToken = (value: string) => {
    if (!value) return false;
    const punctuation = "!#$&^_.+-";
    for (const character of value) {
      const code = character.charCodeAt(0);
      const alphaNumeric =
        (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
      if (!alphaNumeric && !punctuation.includes(character)) return false;
    }
    return true;
  };
  const parts = contentType.split(";");
  const mediaType = parts.shift()?.trim() ?? "";
  const slash = mediaType.indexOf("/");
  if (
    slash <= 0 ||
    slash !== mediaType.lastIndexOf("/") ||
    !isToken(mediaType.slice(0, slash)) ||
    !isToken(mediaType.slice(slash + 1))
  ) {
    return false;
  }

  return parts.every((part) => {
    const parameter = part.trim();
    const equals = parameter.indexOf("=");
    if (equals <= 0 || equals === parameter.length - 1) return false;
    const name = parameter.slice(0, equals).trim();
    const value = parameter.slice(equals + 1).trim();
    if (!isToken(name)) return false;
    if (isToken(value)) return true;
    if (value.length < 2 || value[0] !== '"' || value.at(-1) !== '"') return false;
    for (let index = 1; index < value.length - 1; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 32 || code > 126 || value[index] === '"') return false;
    }
    return true;
  });
}

function canonicalLocale(locale: string | undefined) {
  if (!locale?.trim()) return undefined;
  try {
    return Intl.getCanonicalLocales(locale.trim())[0];
  } catch {
    return null;
  }
}

function fileWriteOutput(
  file: StoredFileForWrite,
  input: { encoding: "utf-8" | "base64"; locale?: string; sourceFileId?: string },
): VisualWorkflowNodeExecutionResult {
  return {
    ok: true,
    switchCase: "success",
    output: {
      fileId: file.id,
      filename: file.filename,
      contentType: file.contentType,
      byteSize: file.byteSize,
      sha256: file.sha256,
      encoding: input.encoding,
      ...(input.locale ? { locale: input.locale } : {}),
      ...(input.sourceFileId ? { sourceFileId: input.sourceFileId } : {}),
    },
  };
}

type FileConversionFormat = "json" | "yaml" | "arb";

const DANGEROUS_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const FILE_CONVERSION_MAX_DEPTH = 64;
const FILE_CONVERSION_MAX_VALUES = 50_000;

function fileConvertError(code: string, message: string): VisualWorkflowNodeExecutionResult {
  return { ok: true, output: { error: { code, message } }, switchCase: "error" };
}

function inferFileConversionFormat(filename: string): FileConversionFormat | null {
  const extension = filename.toLowerCase().match(/\.([^.]+)$/)?.[1];
  if (extension === "json") return "json";
  if (extension === "arb") return "arb";
  if (extension === "yaml" || extension === "yml") return "yaml";
  return null;
}

function inspectConversionValue(
  value: unknown,
  state: { values: number },
  depth = 0,
): { ok: true } | { ok: false; code: string; message: string } {
  if (depth > FILE_CONVERSION_MAX_DEPTH) {
    return {
      ok: false,
      code: "file_conversion_too_deep",
      message: "The file is too deeply nested.",
    };
  }
  state.values += 1;
  if (state.values > FILE_CONVERSION_MAX_VALUES) {
    return {
      ok: false,
      code: "file_conversion_too_large",
      message: "The file has too many values.",
    };
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return { ok: true };
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { ok: true }
      : {
          ok: false,
          code: "unsupported_file_value",
          message: "The file contains a non-finite number.",
        };
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const inspected = inspectConversionValue(item, state, depth + 1);
      if (!inspected.ok) return inspected;
    }
    return { ok: true };
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value)) {
      if (DANGEROUS_OBJECT_KEYS.has(key)) {
        return {
          ok: false,
          code: "unsafe_file_key",
          message: "The file contains an unsafe object key.",
        };
      }
      const inspected = inspectConversionValue(item, state, depth + 1);
      if (!inspected.ok) return inspected;
    }
    return { ok: true };
  }
  return {
    ok: false,
    code: "unsupported_file_value",
    message: "The file contains a value that cannot be converted safely.",
  };
}

function parseConversionSource(
  content: string,
  format: FileConversionFormat,
): { ok: true; value: unknown } | { ok: false; code: string; message: string } {
  try {
    let value: unknown;
    if (format === "yaml") {
      const document = parseDocument(content, {
        schema: "core",
        uniqueKeys: true,
      });
      if (document.errors.length > 0 || document.warnings.length > 0) {
        return { ok: false, code: "invalid_file_format", message: "The YAML file is not valid." };
      }
      value = document.toJS({ maxAliasCount: 0 });
    } else {
      value = JSON.parse(content);
    }
    const inspected = inspectConversionValue(value, { values: 0 });
    return inspected.ok ? { ok: true, value } : inspected;
  } catch {
    return {
      ok: false,
      code: "invalid_file_format",
      message: `The ${format.toUpperCase()} file is not valid.`,
    };
  }
}

function serializeConversionTarget(value: unknown, format: FileConversionFormat) {
  return format === "yaml"
    ? stringifyYaml(value, { aliasDuplicateObjects: false })
    : JSON.stringify(value, null, 2);
}

function convertedFilename(filename: string, targetFormat: FileConversionFormat) {
  const extension = targetFormat === "yaml" ? "yaml" : targetFormat;
  const base = filename.replace(/\.(?:json|arb|ya?ml)$/i, "");
  return `${base}.${extension}`;
}

function convertedContentType(format: FileConversionFormat) {
  return format === "yaml" ? "application/yaml" : "application/json";
}

async function readBoundedBody(
  body: ReadableStream,
  signal?: AbortSignal,
): Promise<{ ok: true; content: Buffer } | { ok: false; code: "cancelled" | "file_too_large" }> {
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let bytesRead = 0;

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        return { ok: false, code: "cancelled" };
      }

      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      bytesRead += value.byteLength;
      if (bytesRead > VISUAL_WORKFLOW_FILE_MAX_BYTES) {
        await reader.cancel();
        return { ok: false, code: "file_too_large" };
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return { ok: true, content: Buffer.concat(chunks, bytesRead) };
}

export async function executeFileReadNode(input: {
  organizationId: string;
  visualWorkflowId?: string;
  fileId: string;
  encoding: "utf-8" | "base64";
  signal?: AbortSignal;
  dependencies?: FileReadDependencies;
}): Promise<VisualWorkflowNodeExecutionResult> {
  const fileId = input.fileId.trim();
  if (!/^file_[A-Za-z0-9_-]+$/.test(fileId)) {
    return fileReadError("invalid_file_reference", "Select a valid stored file.");
  }
  if (!input.visualWorkflowId) {
    return fileReadError("file_actor_required", "A workflow actor is required to read files.");
  }
  if (input.signal?.aborted) {
    return fileReadError("cancelled", "File reading was cancelled.");
  }

  const dependencies = input.dependencies ?? defaultFileReadDependencies;

  try {
    const actor = await dependencies.resolveActor({
      organizationId: input.organizationId,
      visualWorkflowId: input.visualWorkflowId,
    });
    if (!actor) {
      return fileReadError("file_actor_required", "A current organization member must read files.");
    }

    const file = await dependencies.findFile({
      organizationId: input.organizationId,
      projectId: actor.projectId,
      fileId,
    });
    if (!file) {
      return fileReadError("stored_file_not_found", "The stored file was not found.");
    }
    if (file.byteSize > VISUAL_WORKFLOW_FILE_MAX_BYTES) {
      return fileReadError("file_too_large", "The stored file exceeds the workflow size limit.");
    }

    const storedObject = await dependencies.getObject({ keyOrUrl: file.storageKey });
    if (!storedObject) {
      return fileReadError("stored_file_content_missing", "The stored file content is missing.");
    }

    const read = await readBoundedBody(storedObject.body, input.signal);
    if (!read.ok) {
      return fileReadError(
        read.code,
        read.code === "cancelled"
          ? "File reading was cancelled."
          : "The stored file exceeds the workflow size limit.",
      );
    }

    let content: string;
    if (input.encoding === "base64") {
      content = read.content.toString("base64");
    } else {
      try {
        content = new TextDecoder("utf-8", { fatal: true }).decode(read.content);
      } catch {
        return fileReadError("unsupported_file_encoding", "The stored file is not valid UTF-8.");
      }
    }

    const locale = file.metadata.locale;
    return {
      ok: true,
      switchCase: "success",
      output: {
        fileId: file.id,
        content,
        filename: file.filename,
        contentType: file.contentType,
        byteSize: read.content.byteLength,
        sha256: file.sha256,
        encoding: input.encoding,
        ...(typeof locale === "string" && locale.trim() ? { locale } : {}),
        metadata: file.metadata,
      },
    };
  } catch {
    return fileReadError("file_read_failed", "The stored file could not be read.");
  }
}

export async function executeFileWriteNode(input: {
  organizationId: string;
  visualWorkflowId?: string;
  visualWorkflowRunId?: string;
  nodeId: string;
  idempotencyKey?: string;
  content: string;
  filename: string;
  contentType: string;
  encoding: "utf-8" | "base64";
  locale?: string;
  sourceFileId?: string;
  signal?: AbortSignal;
  dependencies?: FileWriteDependencies;
  provenance?: {
    operation: "workflow_file_convert";
    sourceFormat: FileConversionFormat;
    targetFormat: FileConversionFormat;
  };
}): Promise<VisualWorkflowNodeExecutionResult> {
  if (!input.visualWorkflowId) {
    return fileWriteError("file_actor_required", "A workflow actor is required to write files.");
  }
  if (!input.idempotencyKey) {
    return fileWriteError("file_idempotency_required", "A retry key is required to write files.");
  }
  if (input.signal?.aborted) return fileWriteError("cancelled", "File writing was cancelled.");

  const filename = input.filename.trim();
  if (!validFilename(filename)) {
    return fileWriteError("invalid_file_name", "Enter a filename without a host path.");
  }
  const contentType = input.contentType.trim().toLowerCase();
  if (!validContentType(contentType)) {
    return fileWriteError("invalid_content_type", "Enter a valid MIME content type.");
  }
  const locale = canonicalLocale(input.locale);
  if (locale === null) return fileWriteError("invalid_file_locale", "Enter a valid locale.");

  const decoded = decodeFileContent(input.content, input.encoding);
  if (!decoded.ok) {
    return fileWriteError("invalid_base64_content", "The file content is not valid base64.");
  }
  if (decoded.content.byteLength > VISUAL_WORKFLOW_FILE_MAX_BYTES) {
    return fileWriteError("file_too_large", "The file exceeds the workflow size limit.");
  }

  const dependencies = input.dependencies ?? defaultFileWriteDependencies;
  try {
    const actor = await dependencies.resolveActor({
      organizationId: input.organizationId,
      visualWorkflowId: input.visualWorkflowId,
    });
    if (!actor) {
      return fileWriteError(
        "file_actor_required",
        "A current organization member must write files.",
      );
    }

    let sourceFile: StoredFileForWrite | null = null;
    const sourceFileId = input.sourceFileId?.trim() || undefined;
    if (sourceFileId) {
      if (!/^file_[A-Za-z0-9_-]+$/.test(sourceFileId)) {
        return fileWriteError("invalid_file_reference", "Select a valid source file.");
      }
      sourceFile = await dependencies.findFile({
        organizationId: input.organizationId,
        projectId: actor.projectId,
        fileId: sourceFileId,
      });
      if (!sourceFile) {
        return fileWriteError("stored_file_not_found", "The source file was not found.");
      }
    }

    const contentSha256 = await sha256Hex(decoded.content);
    const keyHash = await sha256Hex(Buffer.from(input.idempotencyKey, "utf8"));
    const fileId = `file_vw_${keyHash.slice(0, 32)}`;
    const findExisting = () =>
      dependencies.findFile({
        organizationId: input.organizationId,
        projectId: actor.projectId,
        fileId,
      });
    const replayExisting = (existing: StoredFileForWrite) => {
      const matches =
        existing.sha256 === contentSha256 &&
        existing.filename === filename &&
        existing.contentType === contentType &&
        existing.metadata.idempotencyKey === input.idempotencyKey;
      return matches
        ? fileWriteOutput(existing, { encoding: input.encoding, locale, sourceFileId })
        : fileWriteError(
            "file_idempotency_conflict",
            "This retry key was already used for different file content.",
          );
    };
    const existing = await findExisting();
    if (existing) return replayExisting(existing);

    if (input.signal?.aborted) return fileWriteError("cancelled", "File writing was cancelled.");
    const metadata = {
      operation: input.provenance?.operation ?? "workflow_file_write",
      encoding: input.encoding,
      idempotencyKey: input.idempotencyKey,
      visualWorkflowId: input.visualWorkflowId,
      ...(input.visualWorkflowRunId ? { visualWorkflowRunId: input.visualWorkflowRunId } : {}),
      nodeId: input.nodeId,
      ...(locale ? { locale } : {}),
      ...(sourceFile ? { sourceFileId: sourceFile.id, sourceSha256: sourceFile.sha256 } : {}),
      ...(input.provenance
        ? {
            sourceFormat: input.provenance.sourceFormat,
            targetFormat: input.provenance.targetFormat,
          }
        : {}),
    };
    let file: StoredFileForWrite;
    try {
      file = await dependencies.createFile({
        id: fileId,
        organizationId: input.organizationId,
        projectId: actor.projectId,
        createdByUserId: actor.userId,
        filename,
        contentType,
        content: decoded.content,
        metadata,
      });
    } catch (error) {
      // A concurrent attempt with the same retry key may have created the row first.
      const concurrent = await findExisting();
      if (concurrent) return replayExisting(concurrent);
      throw error;
    }
    return fileWriteOutput(file, { encoding: input.encoding, locale, sourceFileId });
  } catch {
    return fileWriteError("file_write_failed", "The stored file could not be written.");
  }
}

export async function executeFileConvertNode(input: {
  organizationId: string;
  visualWorkflowId?: string;
  visualWorkflowRunId?: string;
  nodeId: string;
  idempotencyKey?: string;
  fileId: string;
  targetFormat: FileConversionFormat;
  filename?: string;
  locale?: string;
  signal?: AbortSignal;
  dependencies?: FileConvertDependencies;
}): Promise<VisualWorkflowNodeExecutionResult> {
  const dependencies: FileConvertDependencies = input.dependencies ?? {
    resolveActor: (scope) => defaultFileWriteDependencies.resolveActor(scope),
    findFile: (scope) => getStoredFileForJobScope(scope),
    getObject: (objectInput) => defaultFileReadDependencies.getObject(objectInput),
    createFile: (fileInput) => defaultFileWriteDependencies.createFile(fileInput),
  };
  const read = await executeFileReadNode({
    organizationId: input.organizationId,
    visualWorkflowId: input.visualWorkflowId,
    fileId: input.fileId,
    encoding: "utf-8",
    signal: input.signal,
    dependencies,
  });
  if (!read.ok || read.switchCase === "error") return read;

  const sourceFilename = read.output.filename;
  const sourceContent = read.output.content;
  if (typeof sourceFilename !== "string" || typeof sourceContent !== "string") {
    return fileConvertError("file_conversion_failed", "The source file could not be converted.");
  }
  const sourceFormat = inferFileConversionFormat(sourceFilename);
  if (!sourceFormat) {
    return fileConvertError(
      "unsupported_file_format",
      "Only JSON, YAML, and ARB files can be converted.",
    );
  }
  const parsed = parseConversionSource(sourceContent, sourceFormat);
  if (!parsed.ok) return fileConvertError(parsed.code, parsed.message);
  if (
    input.targetFormat === "arb" &&
    (parsed.value === null || typeof parsed.value !== "object" || Array.isArray(parsed.value))
  ) {
    return fileConvertError(
      "unsupported_file_value",
      "ARB files must contain an object of messages.",
    );
  }

  let content: string;
  try {
    content = serializeConversionTarget(parsed.value, input.targetFormat);
  } catch {
    return fileConvertError("file_conversion_failed", "The source file could not be converted.");
  }

  const sourceMetadata = read.output.metadata;
  const sourceLocale =
    sourceMetadata &&
    typeof sourceMetadata === "object" &&
    "locale" in sourceMetadata &&
    typeof sourceMetadata.locale === "string"
      ? sourceMetadata.locale
      : undefined;
  const written = await executeFileWriteNode({
    organizationId: input.organizationId,
    visualWorkflowId: input.visualWorkflowId,
    visualWorkflowRunId: input.visualWorkflowRunId,
    nodeId: input.nodeId,
    idempotencyKey: input.idempotencyKey,
    content,
    filename: input.filename?.trim() || convertedFilename(sourceFilename, input.targetFormat),
    contentType: convertedContentType(input.targetFormat),
    encoding: "utf-8",
    locale: input.locale?.trim() || sourceLocale,
    sourceFileId: input.fileId,
    signal: input.signal,
    dependencies,
    provenance: {
      operation: "workflow_file_convert",
      sourceFormat,
      targetFormat: input.targetFormat,
    },
  });
  if (!written.ok || written.switchCase === "error") return written;
  return {
    ...written,
    output: {
      ...written.output,
      sourceFormat,
      targetFormat: input.targetFormat,
    },
  };
}
