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
import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database";
import type {
  LinkedDomainStatus,
  LinkedDomainVerificationMethod,
} from "@/lib/database/schema/linked-domains";
import { isValidDomainSlug } from "@/lib/localisation-audit/domain-slug";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import { buildLinkedDomainChallenges, mintLinkedDomainVerificationToken } from "./challenges";
import type { LinkedDomainError, LinkedDomainAuditDetail, LinkedDomainPublic } from "./types";
import { verifyLinkedDomainChallenge, type PublicFetchFn, type ResolveTxtFn } from "./verify";

export type LinkedDomainRow = typeof schema.linkedDomains.$inferSelect;

function toPublic(row: LinkedDomainRow, auditScore: number | null = null): LinkedDomainPublic {
  return {
    id: row.id,
    organizationId: row.organizationId,
    domainKey: row.domainKey,
    domainSlug: row.domainSlug,
    sourceUrl: row.sourceUrl,
    status: row.status,
    preferredMethod: row.preferredMethod,
    verifiedMethod: row.verifiedMethod,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    localisationAuditId: row.localisationAuditId,
    projectId: row.projectId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    challenges: buildLinkedDomainChallenges({
      domainKey: row.domainKey,
      sourceUrl: row.sourceUrl,
      token: row.verificationToken,
    }),
    auditScore,
  };
}

async function auditScoreByIds(
  auditIds: string[],
  database: DatabaseClient,
): Promise<Map<string, number | null>> {
  const scores = new Map<string, number | null>();
  if (auditIds.length === 0) {
    return scores;
  }

  const rows = await database
    .select({
      id: schema.localisationAudits.id,
      score: schema.localisationAudits.score,
    })
    .from(schema.localisationAudits)
    .where(inArray(schema.localisationAudits.id, auditIds));

  for (const row of rows) {
    scores.set(row.id, row.score);
  }
  return scores;
}

export async function listLinkedDomains(input: {
  organizationId: string;
  database?: DatabaseClient;
}): Promise<LinkedDomainPublic[]> {
  const database = input.database ?? db;
  const rows = await database
    .select()
    .from(schema.linkedDomains)
    .where(eq(schema.linkedDomains.organizationId, input.organizationId))
    .orderBy(desc(schema.linkedDomains.createdAt));

  const auditIds = rows
    .map((row) => row.localisationAuditId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const scores = await auditScoreByIds(auditIds, database);

  return rows.map((row) =>
    toPublic(row, row.localisationAuditId ? (scores.get(row.localisationAuditId) ?? null) : null),
  );
}

export async function getLinkedDomain(input: {
  organizationId: string;
  linkedDomainId: string;
  database?: DatabaseClient;
}): Promise<LinkedDomainPublic | null> {
  const database = input.database ?? db;
  const [row] = await database
    .select()
    .from(schema.linkedDomains)
    .where(
      and(
        eq(schema.linkedDomains.id, input.linkedDomainId),
        eq(schema.linkedDomains.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }

  let auditScore: number | null = null;
  if (row.localisationAuditId) {
    const scores = await auditScoreByIds([row.localisationAuditId], database);
    auditScore = scores.get(row.localisationAuditId) ?? null;
  }

  return toPublic(row, auditScore);
}

export async function getLinkedDomainAudit(input: {
  organizationId: string;
  linkedDomainId: string;
  database?: DatabaseClient;
}): Promise<Result<LinkedDomainAuditDetail, LinkedDomainError>> {
  const database = input.database ?? db;
  const linkedDomain = await getLinkedDomain({
    organizationId: input.organizationId,
    linkedDomainId: input.linkedDomainId,
    database,
  });

  if (!linkedDomain) {
    return err({ code: "linked_domain_not_found", message: "Linked domain was not found." });
  }

  if (!linkedDomain.localisationAuditId) {
    return err({
      code: "audit_not_found",
      message: "No localisation audit is attached to this linked domain.",
    });
  }

  const [audit] = await database
    .select()
    .from(schema.localisationAudits)
    .where(eq(schema.localisationAudits.id, linkedDomain.localisationAuditId))
    .limit(1);

  if (!audit) {
    return err({ code: "audit_not_found", message: "Localisation audit was not found." });
  }

  // Claimed domains may only expose the audit to the owning org.
  if (audit.organizationId && audit.organizationId !== input.organizationId) {
    return err({ code: "linked_domain_not_found", message: "Linked domain was not found." });
  }

  return ok({
    id: audit.id,
    domainKey: audit.domainKey,
    domainSlug: audit.domainSlug,
    sourceUrl: audit.sourceUrl,
    status: audit.status,
    score: audit.score,
    completedAt: audit.completedAt?.toISOString() ?? null,
    teaser: audit.teaser,
    report: audit.report,
  });
}

export async function findVerifiedLinkedDomainByDomainKey(
  domainKey: string,
  database: DatabaseClient = db,
) {
  const [row] = await database
    .select()
    .from(schema.linkedDomains)
    .where(
      and(
        eq(schema.linkedDomains.domainKey, domainKey),
        eq(schema.linkedDomains.status, "verified" satisfies LinkedDomainStatus),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function startLinkedDomainClaim(input: {
  organizationId: string;
  userId: string;
  domainSlug: string;
  database?: DatabaseClient;
}): Promise<Result<LinkedDomainPublic, LinkedDomainError>> {
  const database = input.database ?? db;

  if (!isValidDomainSlug(input.domainSlug)) {
    return err({ code: "invalid_domain_slug", message: "Domain slug is invalid." });
  }

  const [audit] = await database
    .select()
    .from(schema.localisationAudits)
    .where(eq(schema.localisationAudits.domainSlug, input.domainSlug))
    .limit(1);

  if (!audit) {
    return err({ code: "audit_not_found", message: "Localisation audit was not found." });
  }

  if (audit.status !== "succeeded" || audit.report == null) {
    return err({
      code: "audit_not_ready",
      message: "Localisation audit must succeed before it can be claimed.",
    });
  }

  const existingVerified = await findVerifiedLinkedDomainByDomainKey(audit.domainKey, database);
  if (existingVerified) {
    if (existingVerified.organizationId === input.organizationId) {
      return ok(toPublic(existingVerified));
    }
    return err({
      code: "domain_already_claimed",
      message: "This domain is already linked to another workspace.",
    });
  }

  const [existingOrgClaim] = await database
    .select()
    .from(schema.linkedDomains)
    .where(
      and(
        eq(schema.linkedDomains.organizationId, input.organizationId),
        eq(schema.linkedDomains.domainKey, audit.domainKey),
      ),
    )
    .limit(1);

  if (existingOrgClaim) {
    if (existingOrgClaim.status === "pending_verification") {
      return ok(toPublic(existingOrgClaim));
    }
    if (existingOrgClaim.status === "verified") {
      return ok(toPublic(existingOrgClaim));
    }
    // Revive failed/revoked claims with a fresh token.
    const token = mintLinkedDomainVerificationToken();
    const [revived] = await database
      .update(schema.linkedDomains)
      .set({
        status: "pending_verification",
        verificationToken: token,
        preferredMethod: null,
        verifiedMethod: null,
        verifiedAt: null,
        localisationAuditId: audit.id,
        sourceUrl: audit.sourceUrl,
        domainSlug: audit.domainSlug,
        createdByUserId: input.userId,
        projectId: null,
      })
      .where(eq(schema.linkedDomains.id, existingOrgClaim.id))
      .returning();
    return ok(toPublic(revived));
  }

  const token = mintLinkedDomainVerificationToken();
  try {
    const [created] = await database
      .insert(schema.linkedDomains)
      .values({
        organizationId: input.organizationId,
        createdByUserId: input.userId,
        domainKey: audit.domainKey,
        domainSlug: audit.domainSlug,
        sourceUrl: audit.sourceUrl,
        status: "pending_verification",
        verificationToken: token,
        localisationAuditId: audit.id,
      })
      .returning();
    return ok(toPublic(created));
  } catch {
    // Unique (org, domainKey) race — re-read.
    const [raced] = await database
      .select()
      .from(schema.linkedDomains)
      .where(
        and(
          eq(schema.linkedDomains.organizationId, input.organizationId),
          eq(schema.linkedDomains.domainKey, audit.domainKey),
        ),
      )
      .limit(1);
    if (raced) {
      return ok(toPublic(raced));
    }
    return err({
      code: "claim_pending_exists",
      message: "A claim for this domain already exists.",
    });
  }
}

export async function cancelPendingLinkedDomainClaim(input: {
  organizationId: string;
  linkedDomainId: string;
  database?: DatabaseClient;
}): Promise<Result<true, LinkedDomainError>> {
  const database = input.database ?? db;
  const [row] = await database
    .select()
    .from(schema.linkedDomains)
    .where(
      and(
        eq(schema.linkedDomains.id, input.linkedDomainId),
        eq(schema.linkedDomains.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!row) {
    return err({ code: "linked_domain_not_found", message: "Linked domain was not found." });
  }

  if (row.status !== "pending_verification") {
    return err({
      code: "linked_domain_not_pending",
      message: "Only pending claims can be cancelled.",
    });
  }

  await database.delete(schema.linkedDomains).where(eq(schema.linkedDomains.id, row.id));
  return ok(true);
}

export async function verifyAndClaimLinkedDomain(input: {
  organizationId: string;
  userId: string;
  linkedDomainId: string;
  method: LinkedDomainVerificationMethod;
  /** When set, attach the verified domain to this existing org project. */
  projectId?: string;
  /** When true (or when projectId is omitted), create a new native project. */
  createProject?: boolean;
  resolveTxt?: ResolveTxtFn;
  fetchPublic?: PublicFetchFn;
  database?: DatabaseClient;
}): Promise<Result<LinkedDomainPublic, LinkedDomainError>> {
  const database = input.database ?? db;
  const shouldCreateProject = input.createProject === true || !input.projectId;

  if (!shouldCreateProject && !input.projectId) {
    return err({
      code: "project_not_found",
      message: "Select an existing project or create a new one.",
    });
  }

  const [row] = await database
    .select()
    .from(schema.linkedDomains)
    .where(
      and(
        eq(schema.linkedDomains.id, input.linkedDomainId),
        eq(schema.linkedDomains.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!row) {
    return err({ code: "linked_domain_not_found", message: "Linked domain was not found." });
  }

  if (row.status === "verified") {
    return ok(toPublic(row));
  }

  if (row.status !== "pending_verification" && row.status !== "failed") {
    return err({
      code: "linked_domain_not_pending",
      message: "This linked domain cannot be verified in its current state.",
    });
  }

  const existingVerified = await findVerifiedLinkedDomainByDomainKey(row.domainKey, database);
  if (existingVerified && existingVerified.id !== row.id) {
    return err({
      code: "domain_already_claimed",
      message: "This domain is already linked to another workspace.",
    });
  }

  if (!shouldCreateProject && input.projectId) {
    const [existingProject] = await database
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, input.projectId),
          eq(schema.projects.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!existingProject) {
      return err({
        code: "project_not_found",
        message: "Selected project was not found in this workspace.",
      });
    }
  }

  await database
    .update(schema.linkedDomains)
    .set({ preferredMethod: input.method })
    .where(eq(schema.linkedDomains.id, row.id));

  const check = await verifyLinkedDomainChallenge({
    method: input.method,
    domainKey: row.domainKey,
    sourceUrl: row.sourceUrl,
    token: row.verificationToken,
    resolveTxt: input.resolveTxt,
    fetchPublic: input.fetchPublic,
  });

  if (isErr(check)) {
    await database
      .update(schema.linkedDomains)
      .set({ status: "failed" })
      .where(eq(schema.linkedDomains.id, row.id));
    return check;
  }

  try {
    const verified = await database.transaction(async (tx) => {
      const raced = await findVerifiedLinkedDomainByDomainKey(row.domainKey, tx);
      if (raced && raced.id !== row.id) {
        throw new Error("domain_already_claimed");
      }

      let projectId = input.projectId ?? null;
      if (shouldCreateProject) {
        const team = await ensureDefaultWorkspaceTeam(input.organizationId, tx);
        const newProjectId = `project_${randomUUID()}`;
        const [project] = await tx
          .insert(schema.projects)
          .values({
            id: newProjectId,
            organizationId: input.organizationId,
            teamId: team.id,
            createdByUserId: input.userId,
            name: row.domainKey,
            description: `Linked from localisation audit for ${row.domainKey}`,
            source: "native",
            sourceLocale: "en",
            targetLocales: [],
          })
          .returning();

        if (!project) {
          throw new Error("project_create_failed");
        }
        projectId = project.id;
      } else if (projectId) {
        const [existingProject] = await tx
          .select({ id: schema.projects.id })
          .from(schema.projects)
          .where(
            and(
              eq(schema.projects.id, projectId),
              eq(schema.projects.organizationId, input.organizationId),
            ),
          )
          .limit(1);
        if (!existingProject) {
          throw new Error("project_not_found");
        }
      }

      if (!projectId) {
        throw new Error("project_create_failed");
      }

      const [updated] = await tx
        .update(schema.linkedDomains)
        .set({
          status: "verified",
          verifiedMethod: check.value.method,
          verifiedAt: new Date(),
          preferredMethod: input.method,
          projectId,
        })
        .where(eq(schema.linkedDomains.id, row.id))
        .returning();

      if (row.localisationAuditId) {
        await tx
          .update(schema.localisationAudits)
          .set({
            organizationId: input.organizationId,
            linkedDomainId: row.id,
          })
          .where(eq(schema.localisationAudits.id, row.localisationAuditId));
      }

      return updated;
    });

    return ok(toPublic(verified));
  } catch (error) {
    const message = error instanceof Error ? error.message : "verify_failed";
    if (message === "domain_already_claimed") {
      return err({
        code: "domain_already_claimed",
        message: "This domain is already linked to another workspace.",
      });
    }
    if (message === "project_not_found") {
      return err({
        code: "project_not_found",
        message: "Selected project was not found in this workspace.",
      });
    }
    if (message.includes("uq_linked_domains_verified_domain_key")) {
      return err({
        code: "domain_already_claimed",
        message: "This domain is already linked to another workspace.",
      });
    }
    return err({
      code: "project_create_failed",
      message: "Could not create the workspace project for this domain.",
    });
  }
}
