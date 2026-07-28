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
import { eq, sql } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database";

import {
  deriveProjectIdentifierCandidate,
  formatIssueId,
  projectIssueIdentifierSchema,
  uniquifyProjectIdentifier,
} from "./project-issue-identifier";

export async function listTakenProjectIdentifiers(database: DatabaseClient = db) {
  const rows = await database
    .select({ identifier: schema.projects.identifier })
    .from(schema.projects);
  return new Set(rows.map((row) => row.identifier));
}

export async function allocateUniqueProjectIdentifier(input: {
  name: string;
  preferred?: string;
  database?: DatabaseClient;
}) {
  const database = input.database ?? db;
  const taken = await listTakenProjectIdentifiers(database);
  const candidate = input.preferred
    ? projectIssueIdentifierSchema.parse(input.preferred)
    : deriveProjectIdentifierCandidate(input.name);
  return uniquifyProjectIdentifier(candidate, taken);
}

/**
 * Atomically allocate the next per-project issue identifier (PREFIX-N).
 * Must run inside the same transaction as the issue insert.
 * UUID primary key is assigned by the database default.
 */
export async function allocateNextIssueIdentifier(input: {
  projectId: string;
  database?: DatabaseClient;
}): Promise<{ identifier: string; number: number; projectIdentifier: string }> {
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
    identifier: formatIssueId(row.projectIdentifier, row.number),
  };
}
