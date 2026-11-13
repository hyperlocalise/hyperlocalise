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

import { db, schema } from "@/lib/database/client";
import { normalizeSourcePath } from "@/lib/file-storage/records";
import { type MessageFormat, normalizeMessageFormat } from "@/lib/i18n/message-format";
import { normalizePlaceholderPatterns } from "@/lib/i18n/placeholder-patterns";

export interface RepositorySourceFilePlaceholderSettings {
  messageFormat: MessageFormat;
  placeholderPatterns: string[];
}

function sourceFileWhere(input: { organizationId: string; projectId: string; sourcePath: string }) {
  return and(
    eq(schema.repositorySourceFiles.organizationId, input.organizationId),
    eq(schema.repositorySourceFiles.projectId, input.projectId),
    eq(schema.repositorySourceFiles.sourcePath, normalizeSourcePath(input.sourcePath)),
  );
}

export async function getRepositorySourceFileMessageFormat(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
}): Promise<MessageFormat | null> {
  const [row] = await db
    .select({ messageFormat: schema.repositorySourceFiles.messageFormat })
    .from(schema.repositorySourceFiles)
    .where(sourceFileWhere(input))
    .limit(1);

  return row ? normalizeMessageFormat(row.messageFormat) : null;
}

export async function getRepositorySourceFilePlaceholderSettings(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
}): Promise<RepositorySourceFilePlaceholderSettings | null> {
  const [row] = await db
    .select({
      messageFormat: schema.repositorySourceFiles.messageFormat,
      placeholderPatterns: schema.repositorySourceFiles.placeholderPatterns,
    })
    .from(schema.repositorySourceFiles)
    .where(sourceFileWhere(input))
    .limit(1);

  return row
    ? {
        messageFormat: normalizeMessageFormat(row.messageFormat),
        placeholderPatterns: normalizePlaceholderPatterns(row.placeholderPatterns),
      }
    : null;
}

/**
 * Validation-only settings: changing them does not re-ingest the file.
 * Omitted `placeholderPatterns` keeps the stored patterns.
 */
export async function updateRepositorySourceFilePlaceholderSettings(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  messageFormat: MessageFormat;
  placeholderPatterns?: string[];
}): Promise<RepositorySourceFilePlaceholderSettings | null> {
  const [row] = await db
    .update(schema.repositorySourceFiles)
    .set({
      messageFormat: input.messageFormat,
      ...(input.placeholderPatterns
        ? { placeholderPatterns: normalizePlaceholderPatterns(input.placeholderPatterns) }
        : {}),
    })
    .where(sourceFileWhere(input))
    .returning({
      messageFormat: schema.repositorySourceFiles.messageFormat,
      placeholderPatterns: schema.repositorySourceFiles.placeholderPatterns,
    });

  return row
    ? {
        messageFormat: normalizeMessageFormat(row.messageFormat),
        placeholderPatterns: normalizePlaceholderPatterns(row.placeholderPatterns),
      }
    : null;
}
