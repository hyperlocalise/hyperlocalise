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

/** Validation-only setting: changing it does not re-ingest the file. */
export async function updateRepositorySourceFileMessageFormat(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  messageFormat: MessageFormat;
}): Promise<MessageFormat | null> {
  const [row] = await db
    .update(schema.repositorySourceFiles)
    .set({ messageFormat: input.messageFormat })
    .where(sourceFileWhere(input))
    .returning({ messageFormat: schema.repositorySourceFiles.messageFormat });

  return row ? normalizeMessageFormat(row.messageFormat) : null;
}
