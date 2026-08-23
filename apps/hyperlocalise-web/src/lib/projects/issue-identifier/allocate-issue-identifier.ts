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
  deriveProjectIdentifierCandidate,
  extractProjectIdentifierPrefix,
  formatIssueId,
  projectIssueIdentifierSchema,
  uniquifyProjectIdentifier,
} from "./project-issue-identifier";

/**
 * Collect project prefixes that must not be reused: current project.identifier values
 * plus prefixes still present on historical issue identifiers (PREFIX-N).
 */
export async function listTakenProjectIdentifiers(database: DatabaseClient = db) {
  const [projectRows, issueRows] = await Promise.all([
    database.select({ identifier: schema.projects.identifier }).from(schema.projects),
    database
      .select({ identifier: schema.issueSheetIssues.identifier })
      .from(schema.issueSheetIssues),
  ]);

  const taken = new Set(projectRows.map((row) => row.identifier));
  for (const row of issueRows) {
    const prefix = extractProjectIdentifierPrefix(row.identifier);
    if (prefix) {
      taken.add(prefix);
    }
  }
  return taken;
}

export async function isProjectIdentifierTaken(input: {
  identifier: string;
  excludeProjectId?: string;
  database?: DatabaseClient;
}) {
  const database = input.database ?? db;
  const identifier = projectIssueIdentifierSchema.parse(input.identifier);

  const projectConditions = [eq(schema.projects.identifier, identifier)];
  if (input.excludeProjectId) {
    projectConditions.push(ne(schema.projects.id, input.excludeProjectId));
  }

  const [projectTaken] = await database
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(...projectConditions))
    .limit(1);

  if (projectTaken) {
    return true;
  }

  // PREFIX is validated [A-Z0-9] only, so it is safe to embed in a Postgres regex.
  const issuePrefixPattern = `^${identifier}-[1-9][0-9]*$`;
  const issueConditions = [sql`${schema.issueSheetIssues.identifier} ~ ${issuePrefixPattern}`];
  if (input.excludeProjectId) {
    issueConditions.push(ne(schema.issueSheetIssues.projectId, input.excludeProjectId));
  }

  const [issueTaken] = await database
    .select({ id: schema.issueSheetIssues.id })
    .from(schema.issueSheetIssues)
    .where(and(...issueConditions))
    .limit(1);

  return Boolean(issueTaken);
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
 * Advances past any existing issue numbers so random migration placeholders
 * cannot permanently block new creates.
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
      issueNumberSeq: sql`greatest(
        ${schema.projects.issueNumberSeq},
        coalesce(
          (
            select max(${schema.issueSheetIssues.number})
            from ${schema.issueSheetIssues}
            where ${schema.issueSheetIssues.projectId} = ${schema.projects.id}
          ),
          0
        )
      ) + 1`,
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
