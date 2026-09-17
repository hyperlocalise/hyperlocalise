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

import { db, schema, type DatabaseClient, type DatabaseTransaction } from "@/lib/database/client";
import { enqueueActivityLogEvent } from "@/lib/activity-log/activity-log-writer";
import {
  withWorkspaceResourceLimit,
  workspaceResourceFeatureIds,
} from "@/lib/billing/workspace-resource-limits";
import type {
  LinkedDomainStatus,
  LinkedDomainVerificationMethod,
} from "@/lib/database/schema/linked-domains";
import { isValidDomainSlug, resolveDomainIdentity } from "@/lib/localisation-audit/domain-slug";
import { DOMAIN_RESEARCH_MARKETS } from "@/lib/domains/research-prototype";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { ensureDefaultNativeProjectMemory } from "@/lib/memory/ensure-default-native-project-memory";
import {
  ensureDefaultWorkspaceTeam,
  ensureTeamMembership,
} from "@/lib/teams/default-workspace-team";
import { insertWithAllocatedProjectIdentifier } from "@/lib/projects/issue-identifier/allocate-issue-identifier";

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
    marketIds: row.marketIds,
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

  // Full report requires successful domain verification. Pending claims must not
  // bypass the public email-unlock gate or ownership proof.
  const verified = linkedDomain.status === "verified";

  return ok({
    id: audit.id,
    domainKey: audit.domainKey,
    domainSlug: audit.domainSlug,
    sourceUrl: audit.sourceUrl,
    status: audit.status,
    score: audit.score,
    completedAt: audit.completedAt?.toISOString() ?? null,
    teaser: audit.teaser,
    report: verified ? audit.report : null,
  });
}

export async function updateLinkedDomainProject(input: {
  organizationId: string;
  linkedDomainId: string;
  projectId: string | null;
  database?: DatabaseClient;
}): Promise<Result<LinkedDomainPublic, LinkedDomainError>> {
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

  if (row.status !== "verified") {
    return err({
      code: "linked_domain_not_verified",
      message: "Only verified domains can update their project assignment.",
    });
  }

  if (input.projectId) {
    const [project] = await database
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, input.projectId),
          eq(schema.projects.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!project) {
      return err({
        code: "project_not_found",
        message: "Selected project was not found in this workspace.",
      });
    }
  }

  const [updated] = await database
    .update(schema.linkedDomains)
    .set({ projectId: input.projectId })
    .where(eq(schema.linkedDomains.id, row.id))
    .returning();

  if (!updated) {
    return err({ code: "linked_domain_not_found", message: "Linked domain was not found." });
  }

  let auditScore: number | null = null;
  if (updated.localisationAuditId) {
    const scores = await auditScoreByIds([updated.localisationAuditId], database);
    auditScore = scores.get(updated.localisationAuditId) ?? null;
  }

  return ok(toPublic(updated, auditScore));
}

export async function updateLinkedDomainMarkets(input: {
  organizationId: string;
  linkedDomainId: string;
  marketIds: string[];
  database?: DatabaseClient;
}): Promise<Result<LinkedDomainPublic, LinkedDomainError>> {
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
  if (row.status !== "verified") {
    return err({
      code: "linked_domain_not_verified",
      message: "Only verified domains can update markets.",
    });
  }

  const marketIds = [...new Set(input.marketIds)];
  const supportedMarketIds = new Set(DOMAIN_RESEARCH_MARKETS.map((market) => market.id));
  if (
    (marketIds.length === 0 && !row.localisationAuditId) ||
    marketIds.some((marketId) => !supportedMarketIds.has(marketId))
  ) {
    return err({ code: "invalid_market_selection", message: "Select supported markets." });
  }

  const [updated] = await database
    .update(schema.linkedDomains)
    .set({ marketIds })
    .where(eq(schema.linkedDomains.id, row.id))
    .returning();
  if (!updated) {
    return err({ code: "linked_domain_not_found", message: "Linked domain was not found." });
  }
  return ok(toPublic(updated));
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

export async function startDirectLinkedDomainClaim(input: {
  organizationId: string;
  userId: string;
  domain: string;
  marketIds: string[];
  database?: DatabaseClient;
}): Promise<Result<LinkedDomainPublic, LinkedDomainError>> {
  const database = input.database ?? db;
  const identity = resolveDomainIdentity(input.domain);
  if (isErr(identity)) {
    return err({ code: "invalid_domain_url", message: "Enter a public domain or URL." });
  }

  const marketIds = [...new Set(input.marketIds)];
  const supportedMarketIds = new Set(DOMAIN_RESEARCH_MARKETS.map((market) => market.id));
  if (marketIds.some((marketId) => !supportedMarketIds.has(marketId))) {
    return err({
      code: "invalid_market_selection",
      message: "Select supported markets.",
    });
  }

  const existingVerified = await findVerifiedLinkedDomainByDomainKey(
    identity.value.domainKey,
    database,
  );
  if (existingVerified && existingVerified.organizationId !== input.organizationId) {
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
        eq(schema.linkedDomains.domainKey, identity.value.domainKey),
      ),
    )
    .limit(1);

  if (
    existingOrgClaim?.status === "pending_verification" ||
    existingOrgClaim?.status === "verified"
  ) {
    return ok(toPublic(existingOrgClaim));
  }

  const token = mintLinkedDomainVerificationToken();
  if (existingOrgClaim) {
    const [revived] = await database
      .update(schema.linkedDomains)
      .set({
        status: "pending_verification",
        verificationToken: token,
        preferredMethod: null,
        verifiedMethod: null,
        verifiedAt: null,
        localisationAuditId: null,
        sourceUrl: identity.value.sourceUrl,
        domainSlug: identity.value.domainSlug,
        marketIds,
        createdByUserId: input.userId,
        projectId: null,
      })
      .where(eq(schema.linkedDomains.id, existingOrgClaim.id))
      .returning();
    return ok(toPublic(revived));
  }

  try {
    const [created] = await database
      .insert(schema.linkedDomains)
      .values({
        organizationId: input.organizationId,
        createdByUserId: input.userId,
        domainKey: identity.value.domainKey,
        domainSlug: identity.value.domainSlug,
        sourceUrl: identity.value.sourceUrl,
        marketIds,
        status: "pending_verification",
        verificationToken: token,
      })
      .returning();
    return ok(toPublic(created));
  } catch {
    const [raced] = await database
      .select()
      .from(schema.linkedDomains)
      .where(
        and(
          eq(schema.linkedDomains.organizationId, input.organizationId),
          eq(schema.linkedDomains.domainKey, identity.value.domainKey),
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
  /** When true (or when omitted with no projectId), create a new native project. */
  createProject?: boolean;
  /** Markets to persist with the verified domain. Omit to preserve existing selections. */
  marketIds?: string[];
  /** Active team selected by the caller for a newly created project. */
  teamId?: string;
  /** Whether the caller needs explicit membership to see projects on the team. */
  ensureCreatorTeamMembership?: boolean;
  resolveTxt?: ResolveTxtFn;
  fetchPublic?: PublicFetchFn;
  database?: DatabaseClient;
}): Promise<Result<LinkedDomainPublic, LinkedDomainError>> {
  const database = input.database ?? db;
  const shouldCreateProject =
    input.createProject === true || (!input.projectId && input.createProject === undefined);
  const supportedMarketIds = new Set(DOMAIN_RESEARCH_MARKETS.map((market) => market.id));

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

  const marketIds = input.marketIds ? [...new Set(input.marketIds)] : row.marketIds;
  if (marketIds.some((marketId) => !supportedMarketIds.has(marketId))) {
    return err({ code: "invalid_market_selection", message: "Select supported markets." });
  }

  if (!row.localisationAuditId && marketIds.length === 0) {
    return err({
      code: "invalid_market_selection",
      message: "Select at least one supported market.",
    });
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
    // Only mark failed while still unverified. A concurrent verify may have
    // already committed status=verified; demoting it would drop the partial
    // unique index on verified domain_key and allow another workspace to steal
    // the domain.
    await database
      .update(schema.linkedDomains)
      .set({ status: "failed" })
      .where(
        and(
          eq(schema.linkedDomains.id, row.id),
          inArray(schema.linkedDomains.status, ["pending_verification", "failed"]),
        ),
      );
    return check;
  }

  try {
    const verifyInTransaction = async (tx: DatabaseTransaction) => {
      const raced = await findVerifiedLinkedDomainByDomainKey(row.domainKey, tx);
      if (raced && raced.id !== row.id) {
        throw new Error("domain_already_claimed");
      }
      // Concurrent request already verified this claim — do not create another project.
      if (raced && raced.id === row.id) {
        return raced;
      }

      let projectId = input.projectId ?? null;
      if (shouldCreateProject) {
        const team = input.teamId
          ? (
              await tx
                .select()
                .from(schema.teams)
                .where(
                  and(
                    eq(schema.teams.id, input.teamId),
                    eq(schema.teams.organizationId, input.organizationId),
                  ),
                )
                .limit(1)
            )[0]
          : await ensureDefaultWorkspaceTeam(input.organizationId, tx);
        if (!team) throw new Error("invalid_project_team");

        const [project] = await insertWithAllocatedProjectIdentifier({
          organizationId: input.organizationId,
          name: row.domainKey,
          database: tx,
          insert: async (identifier, attemptDb) =>
            attemptDb
              .insert(schema.projects)
              .values({
                id: `project_${randomUUID()}`,
                organizationId: input.organizationId,
                teamId: team.id,
                createdByUserId: input.userId,
                name: row.domainKey,
                identifier,
                description: `Linked from localisation audit for ${row.domainKey}`,
                source: "native",
                sourceLocale: "en-US",
                targetLocales: [],
              })
              .returning(),
        });

        if (!project) {
          throw new Error("project_create_failed");
        }
        if (input.ensureCreatorTeamMembership !== false) {
          await ensureTeamMembership({
            teamId: team.id,
            userId: input.userId,
            database: tx,
          });
        }
        await ensureDefaultNativeProjectMemory({
          organizationId: input.organizationId,
          projectId: project.id,
          projectName: project.name,
          createdByUserId: input.userId,
          database: tx,
        });
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

      const [updated] = await tx
        .update(schema.linkedDomains)
        .set({
          status: "verified",
          verifiedMethod: check.value.method,
          verifiedAt: new Date(),
          preferredMethod: input.method,
          projectId,
          marketIds,
        })
        .where(
          and(
            eq(schema.linkedDomains.id, row.id),
            inArray(schema.linkedDomains.status, ["pending_verification", "failed"]),
          ),
        )
        .returning();

      if (!updated) {
        // Lost the status transition (cancelled or verified mid-flight). Roll back
        // any project created above by aborting the transaction.
        throw new Error("linked_domain_not_pending");
      }

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
    };

    let verified: LinkedDomainRow | undefined;
    if (shouldCreateProject) {
      const limitResult = await withWorkspaceResourceLimit(
        {
          organizationId: input.organizationId,
          featureId: workspaceResourceFeatureIds.projects,
          ...(database === db ? {} : { db: database as DatabaseTransaction }),
          analyticsSource: "linked_domain_claim",
        },
        verifyInTransaction,
      );
      if (!limitResult.ok) {
        if (limitResult.error.code === "workspace_resource_limit_reached") {
          return err({
            code: "project_limit_reached",
            message: "Project limit reached for your current plan.",
          });
        }
        return err({
          code: "project_limit_check_failed",
          message: "Unable to verify project limits. Try again later.",
        });
      }
      verified = limitResult.value;
    } else {
      verified = await database.transaction(verifyInTransaction);
    }

    if (shouldCreateProject && verified.projectId) {
      const [createdProject] = await database
        .select()
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.id, verified.projectId),
            eq(schema.projects.organizationId, input.organizationId),
          ),
        )
        .limit(1);
      if (!createdProject) throw new Error("project_create_failed");
      await enqueueActivityLogEvent({
        actorCredentialId: null,
        actorKind: "user",
        actorUserId: input.userId,
        eventType: "project_created",
        organizationId: input.organizationId,
        payload: {
          name: createdProject.name,
          providerKind: createdProject.externalProviderKind ?? undefined,
          resourceId: createdProject.id,
          source: createdProject.source,
        },
        targetId: createdProject.id,
        targetKind: "project",
      });
    }

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
    if (message === "linked_domain_not_pending") {
      return err({
        code: "linked_domain_not_pending",
        message: "This linked domain cannot be verified in its current state.",
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
