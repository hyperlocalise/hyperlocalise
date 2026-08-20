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
import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database";
import type { FileStorageAdapter } from "@/lib/file-storage";
import { getFileStorageAdapter } from "@/lib/file-storage";
import { createStoredFile } from "@/lib/file-storage/records";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import {
  isSupportedWorkspaceAutomationKnowledgeFilename,
  WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_BYTES,
  WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_FILES,
  type WorkspaceAutomationKnowledgeFileRecord,
  type WorkspaceAutomationKnowledgeFileSummary,
} from "./workspace-automation-knowledge-constants";
import { extractWorkspaceAutomationKnowledgeText } from "./workspace-automation-knowledge-text";

export {
  isSupportedWorkspaceAutomationKnowledgeFilename,
  WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_BYTES,
  WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_FILES,
  type WorkspaceAutomationKnowledgeFileRecord,
  type WorkspaceAutomationKnowledgeFileSummary,
} from "./workspace-automation-knowledge-constants";

type KnowledgeFileRow = typeof schema.workspaceAutomationKnowledgeFiles.$inferSelect;

function serializeKnowledgeFile(row: KnowledgeFileRow): WorkspaceAutomationKnowledgeFileRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    automationId: row.automationId,
    storedFileId: row.storedFileId,
    filename: row.filename,
    contentType: row.contentType,
    byteSize: row.byteSize,
    extractedText: row.extractedText,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSummary(row: KnowledgeFileRow): WorkspaceAutomationKnowledgeFileSummary {
  const record = serializeKnowledgeFile(row);
  return {
    id: record.id,
    organizationId: record.organizationId,
    automationId: record.automationId,
    storedFileId: record.storedFileId,
    filename: record.filename,
    contentType: record.contentType,
    byteSize: record.byteSize,
    createdByUserId: record.createdByUserId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    extractedCharacterCount: record.extractedText.length,
  };
}

export type CreateWorkspaceAutomationKnowledgeFileError =
  | { code: "unsupported_knowledge_file" }
  | { code: "knowledge_file_too_large" }
  | { code: "knowledge_file_limit_reached" }
  | { code: "empty_knowledge_file" };

export async function listWorkspaceAutomationKnowledgeFiles(input: {
  organizationId: string;
  automationId: string;
  db?: DatabaseClient;
}): Promise<WorkspaceAutomationKnowledgeFileSummary[]> {
  const dbClient = input.db ?? db;
  const rows = await dbClient
    .select()
    .from(schema.workspaceAutomationKnowledgeFiles)
    .where(
      and(
        eq(schema.workspaceAutomationKnowledgeFiles.organizationId, input.organizationId),
        eq(schema.workspaceAutomationKnowledgeFiles.automationId, input.automationId),
      ),
    )
    .orderBy(desc(schema.workspaceAutomationKnowledgeFiles.createdAt));

  return rows.map(toSummary);
}

export async function listWorkspaceAutomationKnowledgeFileContents(input: {
  organizationId: string;
  automationId: string;
  db?: DatabaseClient;
}): Promise<WorkspaceAutomationKnowledgeFileRecord[]> {
  const dbClient = input.db ?? db;
  const rows = await dbClient
    .select()
    .from(schema.workspaceAutomationKnowledgeFiles)
    .where(
      and(
        eq(schema.workspaceAutomationKnowledgeFiles.organizationId, input.organizationId),
        eq(schema.workspaceAutomationKnowledgeFiles.automationId, input.automationId),
      ),
    )
    .orderBy(desc(schema.workspaceAutomationKnowledgeFiles.createdAt));

  return rows.map(serializeKnowledgeFile);
}

export async function createWorkspaceAutomationKnowledgeFile(input: {
  organizationId: string;
  automationId: string;
  createdByUserId?: string | null;
  filename: string;
  contentType: string;
  content: Buffer;
  adapter?: FileStorageAdapter;
  db?: DatabaseClient;
}): Promise<
  Result<WorkspaceAutomationKnowledgeFileSummary, CreateWorkspaceAutomationKnowledgeFileError>
> {
  if (!isSupportedWorkspaceAutomationKnowledgeFilename(input.filename)) {
    return err({ code: "unsupported_knowledge_file" });
  }

  if (input.content.byteLength === 0) {
    return err({ code: "empty_knowledge_file" });
  }

  if (input.content.byteLength > WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_BYTES) {
    return err({ code: "knowledge_file_too_large" });
  }

  const dbClient = input.db ?? db;
  const existing = await listWorkspaceAutomationKnowledgeFiles({
    organizationId: input.organizationId,
    automationId: input.automationId,
    db: dbClient,
  });
  if (existing.length >= WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_FILES) {
    return err({ code: "knowledge_file_limit_reached" });
  }

  const extracted = await extractWorkspaceAutomationKnowledgeText({
    filename: input.filename,
    contentType: input.contentType,
    content: input.content,
  });

  const storedFile = await createStoredFile({
    organizationId: input.organizationId,
    createdByUserId: input.createdByUserId,
    role: "reference",
    sourceKind: "automation_knowledge",
    filename: input.filename,
    contentType: input.contentType || "application/octet-stream",
    content: input.content,
    metadata: {
      automationId: input.automationId,
      knowledgeSurface: "workspace_automation",
    },
    adapter: input.adapter,
    db: dbClient,
  });

  const [row] = await dbClient
    .insert(schema.workspaceAutomationKnowledgeFiles)
    .values({
      organizationId: input.organizationId,
      automationId: input.automationId,
      storedFileId: storedFile.id,
      filename: input.filename,
      contentType: storedFile.contentType,
      byteSize: storedFile.byteSize,
      extractedText: extracted.text,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning();

  return ok(toSummary(row));
}

export async function deleteWorkspaceAutomationKnowledgeFile(input: {
  organizationId: string;
  automationId: string;
  knowledgeFileId: string;
  adapter?: FileStorageAdapter;
  db?: DatabaseClient;
}): Promise<boolean> {
  const dbClient = input.db ?? db;
  const [row] = await dbClient
    .select()
    .from(schema.workspaceAutomationKnowledgeFiles)
    .where(
      and(
        eq(schema.workspaceAutomationKnowledgeFiles.id, input.knowledgeFileId),
        eq(schema.workspaceAutomationKnowledgeFiles.organizationId, input.organizationId),
        eq(schema.workspaceAutomationKnowledgeFiles.automationId, input.automationId),
      ),
    )
    .limit(1);

  if (!row) {
    return false;
  }

  const [storedFile] = await dbClient
    .select({
      id: schema.storedFiles.id,
      storageKey: schema.storedFiles.storageKey,
    })
    .from(schema.storedFiles)
    .where(eq(schema.storedFiles.id, row.storedFileId))
    .limit(1);

  await dbClient
    .delete(schema.workspaceAutomationKnowledgeFiles)
    .where(eq(schema.workspaceAutomationKnowledgeFiles.id, row.id));

  if (storedFile) {
    await dbClient.delete(schema.storedFiles).where(eq(schema.storedFiles.id, storedFile.id));
    const adapter = input.adapter ?? getFileStorageAdapter();
    await adapter.delete({ keyOrUrl: storedFile.storageKey }).catch(() => undefined);
  }

  return true;
}
