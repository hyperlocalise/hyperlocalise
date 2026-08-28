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
import { and, desc, eq, lt } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { err, type Result } from "@/lib/primitives/result/results";
import { mergeVersionedDocumentRevisionPage } from "@/lib/versioned-document/merge-versioned-document-revision-page";
import {
  commitKnowledgeMemoryForOrganization,
  commitKnowledgeMemoryForProject,
} from "./knowledge-memory";
import type {
  KnowledgeMemoryCommitResult,
  KnowledgeMemoryRestoreError,
  KnowledgeMemoryRevision,
  KnowledgeMemoryRevisionMetadata,
  RevisionAuthorRow,
} from "./knowledge-memory.types";

function createdByName(row: RevisionAuthorRow) {
  const name = [row.createdByFirstName, row.createdByLastName].filter(Boolean).join(" ").trim();
  return name || null;
}

export async function listKnowledgeMemoryRevisions(input: {
  organizationId: string;
  limit: number;
  cursor?: number;
}): Promise<{
  knowledgeMemoryRevisions: KnowledgeMemoryRevisionMetadata[];
  nextCursor: number | null;
}> {
  const currentRows = await db
    .select({
      revisionId: schema.knowledgeMemories.revisionId,
      version: schema.knowledgeMemories.version,
      summary: schema.knowledgeMemories.summary,
      createdAt: schema.knowledgeMemories.updatedAt,
      createdByUserId: schema.knowledgeMemories.updatedByUserId,
      createdByFirstName: schema.users.firstName,
      createdByLastName: schema.users.lastName,
    })
    .from(schema.knowledgeMemories)
    .leftJoin(schema.users, eq(schema.knowledgeMemories.updatedByUserId, schema.users.id))
    .where(
      and(
        eq(schema.knowledgeMemories.organizationId, input.organizationId),
        input.cursor === undefined ? undefined : lt(schema.knowledgeMemories.version, input.cursor),
      ),
    )
    .limit(1);

  const archivedRows = await db
    .select({
      revisionId: schema.knowledgeMemoryRevisions.id,
      version: schema.knowledgeMemoryRevisions.version,
      summary: schema.knowledgeMemoryRevisions.summary,
      createdAt: schema.knowledgeMemoryRevisions.createdAt,
      createdByUserId: schema.knowledgeMemoryRevisions.createdByUserId,
      createdByFirstName: schema.users.firstName,
      createdByLastName: schema.users.lastName,
    })
    .from(schema.knowledgeMemoryRevisions)
    .leftJoin(schema.users, eq(schema.knowledgeMemoryRevisions.createdByUserId, schema.users.id))
    .where(
      and(
        eq(schema.knowledgeMemoryRevisions.organizationId, input.organizationId),
        input.cursor === undefined
          ? undefined
          : lt(schema.knowledgeMemoryRevisions.version, input.cursor),
      ),
    )
    .orderBy(desc(schema.knowledgeMemoryRevisions.version))
    .limit(input.limit + 1);

  const currentRevisions = currentRows.map((row) => ({
    revisionId: row.revisionId,
    version: row.version,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
    createdByName: createdByName(row),
    isCurrent: true,
  }));
  const archivedRevisions = archivedRows.map((row) => ({
    revisionId: row.revisionId,
    version: row.version,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
    createdByName: createdByName(row),
    isCurrent: false,
  }));

  const { revisions: knowledgeMemoryRevisions, nextCursor } = mergeVersionedDocumentRevisionPage({
    currentRevisions,
    archivedRevisions,
    limit: input.limit,
  });

  return { knowledgeMemoryRevisions, nextCursor };
}

async function findKnowledgeMemoryRevision(
  organizationId: string,
  revisionId: string,
): Promise<KnowledgeMemoryRevision | null> {
  const [current] = await db
    .select({
      revisionId: schema.knowledgeMemories.revisionId,
      version: schema.knowledgeMemories.version,
      content: schema.knowledgeMemories.content,
      summary: schema.knowledgeMemories.summary,
      createdAt: schema.knowledgeMemories.updatedAt,
      createdByUserId: schema.knowledgeMemories.updatedByUserId,
      createdByFirstName: schema.users.firstName,
      createdByLastName: schema.users.lastName,
    })
    .from(schema.knowledgeMemories)
    .leftJoin(schema.users, eq(schema.knowledgeMemories.updatedByUserId, schema.users.id))
    .where(
      and(
        eq(schema.knowledgeMemories.organizationId, organizationId),
        eq(schema.knowledgeMemories.revisionId, revisionId),
      ),
    )
    .limit(1);

  if (current) {
    return {
      revisionId: current.revisionId,
      version: current.version,
      content: current.content,
      summary: current.summary,
      createdAt: current.createdAt.toISOString(),
      createdByUserId: current.createdByUserId,
      createdByName: createdByName(current),
      isCurrent: true,
    };
  }

  const [archived] = await db
    .select({
      revisionId: schema.knowledgeMemoryRevisions.id,
      version: schema.knowledgeMemoryRevisions.version,
      content: schema.knowledgeMemoryRevisions.content,
      summary: schema.knowledgeMemoryRevisions.summary,
      createdAt: schema.knowledgeMemoryRevisions.createdAt,
      createdByUserId: schema.knowledgeMemoryRevisions.createdByUserId,
      createdByFirstName: schema.users.firstName,
      createdByLastName: schema.users.lastName,
    })
    .from(schema.knowledgeMemoryRevisions)
    .leftJoin(schema.users, eq(schema.knowledgeMemoryRevisions.createdByUserId, schema.users.id))
    .where(
      and(
        eq(schema.knowledgeMemoryRevisions.organizationId, organizationId),
        eq(schema.knowledgeMemoryRevisions.id, revisionId),
      ),
    )
    .limit(1);

  return archived
    ? {
        revisionId: archived.revisionId,
        version: archived.version,
        content: archived.content,
        summary: archived.summary,
        createdAt: archived.createdAt.toISOString(),
        createdByUserId: archived.createdByUserId,
        createdByName: createdByName(archived),
        isCurrent: false,
      }
    : null;
}

export async function getKnowledgeMemoryRevisionForOrganization(input: {
  organizationId: string;
  revisionId: string;
}): Promise<{
  knowledgeMemoryRevision: KnowledgeMemoryRevision;
  previousKnowledgeMemoryRevision: KnowledgeMemoryRevision | null;
} | null> {
  const knowledgeMemoryRevision = await findKnowledgeMemoryRevision(
    input.organizationId,
    input.revisionId,
  );

  if (!knowledgeMemoryRevision) {
    return null;
  }

  if (knowledgeMemoryRevision.version === 1) {
    return { knowledgeMemoryRevision, previousKnowledgeMemoryRevision: null };
  }

  const [previous] = await db
    .select({
      revisionId: schema.knowledgeMemoryRevisions.id,
      version: schema.knowledgeMemoryRevisions.version,
      content: schema.knowledgeMemoryRevisions.content,
      summary: schema.knowledgeMemoryRevisions.summary,
      createdAt: schema.knowledgeMemoryRevisions.createdAt,
      createdByUserId: schema.knowledgeMemoryRevisions.createdByUserId,
      createdByFirstName: schema.users.firstName,
      createdByLastName: schema.users.lastName,
    })
    .from(schema.knowledgeMemoryRevisions)
    .leftJoin(schema.users, eq(schema.knowledgeMemoryRevisions.createdByUserId, schema.users.id))
    .where(
      and(
        eq(schema.knowledgeMemoryRevisions.organizationId, input.organizationId),
        eq(schema.knowledgeMemoryRevisions.version, knowledgeMemoryRevision.version - 1),
      ),
    )
    .limit(1);

  const previousKnowledgeMemoryRevision = previous
    ? {
        revisionId: previous.revisionId,
        version: previous.version,
        content: previous.content,
        summary: previous.summary,
        createdAt: previous.createdAt.toISOString(),
        createdByUserId: previous.createdByUserId,
        createdByName: createdByName(previous),
        isCurrent: false,
      }
    : null;

  return { knowledgeMemoryRevision, previousKnowledgeMemoryRevision };
}

export async function restoreKnowledgeMemoryRevisionForOrganization(input: {
  organizationId: string;
  revisionId: string;
  restoredByUserId: string;
  expectedRevisionId: string | null;
}): Promise<Result<KnowledgeMemoryCommitResult, KnowledgeMemoryRestoreError>> {
  const revision = await findKnowledgeMemoryRevision(input.organizationId, input.revisionId);
  if (!revision) {
    return err({ code: "revision_not_found" });
  }

  return commitKnowledgeMemoryForOrganization({
    organizationId: input.organizationId,
    content: revision.content,
    summary: `Restored version ${revision.version}`,
    updatedByUserId: input.restoredByUserId,
    expectedRevisionId: input.expectedRevisionId,
    forceNewRevision: true,
  });
}

export async function listKnowledgeMemoryRevisionsForProject(input: {
  projectId: string;
  limit: number;
  cursor?: number;
}): Promise<{
  knowledgeMemoryRevisions: KnowledgeMemoryRevisionMetadata[];
  nextCursor: number | null;
}> {
  const currentRows = await db
    .select({
      revisionId: schema.projectKnowledgeMemories.revisionId,
      version: schema.projectKnowledgeMemories.version,
      summary: schema.projectKnowledgeMemories.summary,
      createdAt: schema.projectKnowledgeMemories.updatedAt,
      createdByUserId: schema.projectKnowledgeMemories.updatedByUserId,
      createdByFirstName: schema.users.firstName,
      createdByLastName: schema.users.lastName,
    })
    .from(schema.projectKnowledgeMemories)
    .leftJoin(schema.users, eq(schema.projectKnowledgeMemories.updatedByUserId, schema.users.id))
    .where(
      and(
        eq(schema.projectKnowledgeMemories.projectId, input.projectId),
        input.cursor === undefined
          ? undefined
          : lt(schema.projectKnowledgeMemories.version, input.cursor),
      ),
    )
    .limit(1);

  const archivedRows = await db
    .select({
      revisionId: schema.projectKnowledgeMemoryRevisions.id,
      version: schema.projectKnowledgeMemoryRevisions.version,
      summary: schema.projectKnowledgeMemoryRevisions.summary,
      createdAt: schema.projectKnowledgeMemoryRevisions.createdAt,
      createdByUserId: schema.projectKnowledgeMemoryRevisions.createdByUserId,
      createdByFirstName: schema.users.firstName,
      createdByLastName: schema.users.lastName,
    })
    .from(schema.projectKnowledgeMemoryRevisions)
    .leftJoin(
      schema.users,
      eq(schema.projectKnowledgeMemoryRevisions.createdByUserId, schema.users.id),
    )
    .where(
      and(
        eq(schema.projectKnowledgeMemoryRevisions.projectId, input.projectId),
        input.cursor === undefined
          ? undefined
          : lt(schema.projectKnowledgeMemoryRevisions.version, input.cursor),
      ),
    )
    .orderBy(desc(schema.projectKnowledgeMemoryRevisions.version))
    .limit(input.limit + 1);

  const currentRevisions = currentRows.map((row) => ({
    revisionId: row.revisionId,
    version: row.version,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
    createdByName: createdByName(row),
    isCurrent: true,
  }));
  const archivedRevisions = archivedRows.map((row) => ({
    revisionId: row.revisionId,
    version: row.version,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
    createdByName: createdByName(row),
    isCurrent: false,
  }));

  const { revisions: knowledgeMemoryRevisions, nextCursor } = mergeVersionedDocumentRevisionPage({
    currentRevisions,
    archivedRevisions,
    limit: input.limit,
  });

  return { knowledgeMemoryRevisions, nextCursor };
}

async function findProjectKnowledgeMemoryRevision(
  projectId: string,
  revisionId: string,
): Promise<KnowledgeMemoryRevision | null> {
  const [current] = await db
    .select({
      revisionId: schema.projectKnowledgeMemories.revisionId,
      version: schema.projectKnowledgeMemories.version,
      content: schema.projectKnowledgeMemories.content,
      summary: schema.projectKnowledgeMemories.summary,
      createdAt: schema.projectKnowledgeMemories.updatedAt,
      createdByUserId: schema.projectKnowledgeMemories.updatedByUserId,
      createdByFirstName: schema.users.firstName,
      createdByLastName: schema.users.lastName,
    })
    .from(schema.projectKnowledgeMemories)
    .leftJoin(schema.users, eq(schema.projectKnowledgeMemories.updatedByUserId, schema.users.id))
    .where(
      and(
        eq(schema.projectKnowledgeMemories.projectId, projectId),
        eq(schema.projectKnowledgeMemories.revisionId, revisionId),
      ),
    )
    .limit(1);

  if (current) {
    return {
      revisionId: current.revisionId,
      version: current.version,
      content: current.content,
      summary: current.summary,
      createdAt: current.createdAt.toISOString(),
      createdByUserId: current.createdByUserId,
      createdByName: createdByName(current),
      isCurrent: true,
    };
  }

  const [archived] = await db
    .select({
      revisionId: schema.projectKnowledgeMemoryRevisions.id,
      version: schema.projectKnowledgeMemoryRevisions.version,
      content: schema.projectKnowledgeMemoryRevisions.content,
      summary: schema.projectKnowledgeMemoryRevisions.summary,
      createdAt: schema.projectKnowledgeMemoryRevisions.createdAt,
      createdByUserId: schema.projectKnowledgeMemoryRevisions.createdByUserId,
      createdByFirstName: schema.users.firstName,
      createdByLastName: schema.users.lastName,
    })
    .from(schema.projectKnowledgeMemoryRevisions)
    .leftJoin(
      schema.users,
      eq(schema.projectKnowledgeMemoryRevisions.createdByUserId, schema.users.id),
    )
    .where(
      and(
        eq(schema.projectKnowledgeMemoryRevisions.projectId, projectId),
        eq(schema.projectKnowledgeMemoryRevisions.id, revisionId),
      ),
    )
    .limit(1);

  return archived
    ? {
        revisionId: archived.revisionId,
        version: archived.version,
        content: archived.content,
        summary: archived.summary,
        createdAt: archived.createdAt.toISOString(),
        createdByUserId: archived.createdByUserId,
        createdByName: createdByName(archived),
        isCurrent: false,
      }
    : null;
}

export async function getKnowledgeMemoryRevisionForProject(input: {
  projectId: string;
  revisionId: string;
}): Promise<{
  knowledgeMemoryRevision: KnowledgeMemoryRevision;
  previousKnowledgeMemoryRevision: KnowledgeMemoryRevision | null;
} | null> {
  const knowledgeMemoryRevision = await findProjectKnowledgeMemoryRevision(
    input.projectId,
    input.revisionId,
  );

  if (!knowledgeMemoryRevision) {
    return null;
  }

  if (knowledgeMemoryRevision.version === 1) {
    return { knowledgeMemoryRevision, previousKnowledgeMemoryRevision: null };
  }

  const [previous] = await db
    .select({
      revisionId: schema.projectKnowledgeMemoryRevisions.id,
      version: schema.projectKnowledgeMemoryRevisions.version,
      content: schema.projectKnowledgeMemoryRevisions.content,
      summary: schema.projectKnowledgeMemoryRevisions.summary,
      createdAt: schema.projectKnowledgeMemoryRevisions.createdAt,
      createdByUserId: schema.projectKnowledgeMemoryRevisions.createdByUserId,
      createdByFirstName: schema.users.firstName,
      createdByLastName: schema.users.lastName,
    })
    .from(schema.projectKnowledgeMemoryRevisions)
    .leftJoin(
      schema.users,
      eq(schema.projectKnowledgeMemoryRevisions.createdByUserId, schema.users.id),
    )
    .where(
      and(
        eq(schema.projectKnowledgeMemoryRevisions.projectId, input.projectId),
        eq(schema.projectKnowledgeMemoryRevisions.version, knowledgeMemoryRevision.version - 1),
      ),
    )
    .limit(1);

  const previousKnowledgeMemoryRevision = previous
    ? {
        revisionId: previous.revisionId,
        version: previous.version,
        content: previous.content,
        summary: previous.summary,
        createdAt: previous.createdAt.toISOString(),
        createdByUserId: previous.createdByUserId,
        createdByName: createdByName(previous),
        isCurrent: false,
      }
    : null;

  return { knowledgeMemoryRevision, previousKnowledgeMemoryRevision };
}

export async function restoreKnowledgeMemoryRevisionForProject(input: {
  projectId: string;
  revisionId: string;
  restoredByUserId: string;
  expectedRevisionId: string | null;
}): Promise<Result<KnowledgeMemoryCommitResult, KnowledgeMemoryRestoreError>> {
  const revision = await findProjectKnowledgeMemoryRevision(input.projectId, input.revisionId);
  if (!revision) {
    return err({ code: "revision_not_found" });
  }

  return commitKnowledgeMemoryForProject({
    projectId: input.projectId,
    content: revision.content,
    summary: `Restored version ${revision.version}`,
    updatedByUserId: input.restoredByUserId,
    expectedRevisionId: input.expectedRevisionId,
    forceNewRevision: true,
  });
}
