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
import { and, eq, ne, sql } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database";

import {
  deriveProjectIssueIdentifierCandidate,
  formatIssueIdentifier,
  projectIssueIdentifierSchema,
  uniquifyProjectIssueIdentifier,
} from "./project-issue-identifier";

export async function listTakenProjectIdentifiers(
  organizationId: string,
  database: DatabaseClient = db,
  excludeProjectId?: string,
) {
  const conditions = [eq(schema.projects.organizationId, organizationId)];
  if (excludeProjectId) {
    conditions.push(ne(schema.projects.id, excludeProjectId));
  }

  const rows = await database
    .select({ identifier: schema.projects.identifier })
    .from(schema.projects)
    .where(and(...conditions));

  return new Set(rows.map((row) => row.identifier));
}

export async function allocateUniqueProjectIdentifier(input: {
  organizationId: string;
  name: string;
  preferred?: string;
  excludeProjectId?: string;
  database?: DatabaseClient;
}) {
  const database = input.database ?? db;
  const taken = await listTakenProjectIdentifiers(
    input.organizationId,
    database,
    input.excludeProjectId,
  );
  const candidate = input.preferred
    ? projectIssueIdentifierSchema.parse(input.preferred)
    : deriveProjectIssueIdentifierCandidate(input.name);
  return uniquifyProjectIssueIdentifier(candidate, taken);
}

export async function allocateNextIssueIdentifier(input: {
  projectId: string;
  database?: DatabaseClient;
}): Promise<{ number: number; identifier: string; projectIdentifier: string }> {
  const database = input.database ?? db;
  const [row] = await database
    .update(schema.projects)
    .set({
      issueNumberSeq: sql`${schema.projects.issueNumberSeq} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(schema.projects.id, input.projectId))
    .returning({
      number: schema.projects.issueNumberSeq,
      projectIdentifier: schema.projects.identifier,
    });

  if (!row) {
    throw new Error("project_not_found_for_issue_identifier");
  }

  return {
    number: row.number,
    projectIdentifier: row.projectIdentifier,
    identifier: formatIssueIdentifier(row.projectIdentifier, row.number),
  };
}

export async function rewriteProjectIssueIdentifiers(input: {
  projectId: string;
  projectIdentifier: string;
  database?: DatabaseClient;
}) {
  const database = input.database ?? db;
  await database
    .update(schema.issueSheetIssues)
    .set({
      identifier: sql`${input.projectIdentifier} || '-' || ${schema.issueSheetIssues.number}::text`,
      updatedAt: new Date(),
    })
    .where(eq(schema.issueSheetIssues.projectId, input.projectId));
}
