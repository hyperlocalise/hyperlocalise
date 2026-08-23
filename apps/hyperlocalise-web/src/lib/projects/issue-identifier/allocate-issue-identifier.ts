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
  formatIssueId,
  projectIssueIdentifierSchema,
  uniquifyProjectIdentifier,
} from "./project-issue-identifier";

const PROJECT_IDENTIFIER_INSERT_ATTEMPTS = 8;

function uniqueConstraintName(error: unknown): string | null {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ("constraint" in current && typeof current.constraint === "string") {
      return current.constraint;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return null;
}

export function isProjectIdentifierUniqueViolation(error: unknown): boolean {
  return uniqueConstraintName(error) === "projects_organization_id_identifier_key";
}

/**
 * Collect project prefixes that must not be reused in one organization:
 * current project.identifier values plus prefixes still present on
 * historical issue identifiers (PREFIX-N).
 */
export async function listTakenProjectIdentifiers(
  organizationId: string,
  database: DatabaseClient = db,
) {
  const [projectRows, issuePrefixRows] = await Promise.all([
    database
      .select({ identifier: schema.projects.identifier })
      .from(schema.projects)
      .where(eq(schema.projects.organizationId, organizationId)),
    database
      .select({
        prefix: sql<string>`split_part(${schema.issueSheetIssues.identifier}, '-', 1)`.as("prefix"),
      })
      .from(schema.issueSheetIssues)
      .where(eq(schema.issueSheetIssues.organizationId, organizationId))
      .groupBy(sql`split_part(${schema.issueSheetIssues.identifier}, '-', 1)`),
  ]);

  const taken = new Set(projectRows.map((row) => row.identifier));
  for (const row of issuePrefixRows) {
    if (row.prefix) {
      taken.add(row.prefix);
    }
  }
  return taken;
}

export async function isProjectIdentifierTaken(input: {
  organizationId: string;
  identifier: string;
  excludeProjectId?: string;
  database?: DatabaseClient;
}) {
  const database = input.database ?? db;
  const identifier = projectIssueIdentifierSchema.parse(input.identifier);

  const projectConditions = [
    eq(schema.projects.organizationId, input.organizationId),
    eq(schema.projects.identifier, identifier),
  ];
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

  // PREFIX is validated [A-Z0-9] only, so it is safe to embed in a LIKE prefix.
  const issueConditions = [
    eq(schema.issueSheetIssues.organizationId, input.organizationId),
    sql`${schema.issueSheetIssues.identifier} like ${`${identifier}-%`}`,
  ];
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
  organizationId: string;
  name: string;
  preferred?: string;
  excludeProjectId?: string;
  database?: DatabaseClient;
}) {
  const database = input.database ?? db;
  const candidate = input.preferred
    ? projectIssueIdentifierSchema.parse(input.preferred)
    : deriveProjectIdentifierCandidate(input.name);
  const taken = new Set<string>();

  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const next = uniquifyProjectIdentifier(candidate, taken);
    const takenAlready = await isProjectIdentifierTaken({
      organizationId: input.organizationId,
      identifier: next,
      excludeProjectId: input.excludeProjectId,
      database,
    });
    if (!takenAlready) {
      return next;
    }
    taken.add(next);
  }

  throw new Error("project_issue_identifier_exhausted");
}

/**
 * Allocate a prefix, run `insert`, and retry when two creates race on
 * `projects_organization_id_identifier_key`. Each attempt runs in a nested
 * transaction so a unique violation only rolls back that attempt (Drizzle
 * savepoint when the caller already has a transaction).
 */
export async function insertWithAllocatedProjectIdentifier<T>(input: {
  organizationId: string;
  name: string;
  preferred?: string;
  excludeProjectId?: string;
  database?: DatabaseClient;
  insert: (identifier: string, database: DatabaseClient) => Promise<T>;
}): Promise<T> {
  const database = input.database ?? db;
  let lastError: unknown;

  for (let attempt = 0; attempt < PROJECT_IDENTIFIER_INSERT_ATTEMPTS; attempt += 1) {
    try {
      return await database.transaction(async (attemptDb) => {
        const identifier = await allocateUniqueProjectIdentifier({
          organizationId: input.organizationId,
          name: input.name,
          preferred: input.preferred,
          excludeProjectId: input.excludeProjectId,
          database: attemptDb,
        });
        return await input.insert(identifier, attemptDb);
      });
    } catch (error) {
      if (!isProjectIdentifierUniqueViolation(error)) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("project_issue_identifier_exhausted");
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
