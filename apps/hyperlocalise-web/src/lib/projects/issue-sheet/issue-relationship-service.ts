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
import { and, eq, or, sql } from "drizzle-orm";

import { buildAccessibleProjectsWhere } from "@/api/auth/team-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema, type DatabaseClient, type DatabaseTransaction } from "@/lib/database";
import type { IssueSheetRelationshipKind } from "@/lib/database/schema/issue-sheet";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import { ProjectServiceBase } from "@/lib/projects/project-service-base";

import { wouldCreateCycle } from "./issue-relationship-guards";
import {
  ISSUE_SHEET_ACTIVITY_RELATIONSHIP_ADDED,
  ISSUE_SHEET_ACTIVITY_RELATIONSHIP_REMOVED,
} from "./issue-sheet-service";

// Requestable at the API boundary; "blocked_by" is normalized to a stored
// (inverted) "blocks" edge before it ever reaches the database.
export type IssueRelationshipRequestKind = "related" | "blocks" | "blocked_by" | "duplicate_of";

// What's shown to the actor: identical to the request kinds, plus "duplicate"
// for the read-only "another issue is a duplicate of this one" direction that
// has no corresponding request kind.
export type IssueRelationshipPresentedKind =
  | "related"
  | "blocks"
  | "blocked_by"
  | "duplicate_of"
  | "duplicate";

export type IssueRelationshipOtherIssue = {
  issueId: string;
  projectId: string;
  title: string;
  status: string;
};

export type IssueRelationship = {
  id: string;
  presentedKind: IssueRelationshipPresentedKind;
  otherIssue: IssueRelationshipOtherIssue;
  createdAt: string;
};

export type IssueRelationshipError =
  | { code: "issue_not_found" }
  | { code: "relationship_target_is_self" }
  | { code: "related_issue_not_found" }
  | { code: "issue_already_marked_duplicate" }
  | { code: "relationship_already_exists" }
  | { code: "blocking_relationship_cycle" }
  | { code: "duplicate_relationship_cycle" }
  | { code: "relationship_not_found" };

// Thrown inside the locked transaction below to abort/rollback on a validation
// failure while still surfacing the specific error code to the caller — a
// transaction callback's return value becomes the transaction's result, so a
// plain `return err(...)` from inside it can't distinguish "validation failed"
// from "here is the successfully inserted row".
class RelationshipConflictError extends Error {
  constructor(readonly code: IssueRelationshipError["code"]) {
    super(code);
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if ("code" in error && error.code === "23505") {
    return true;
  }
  const cause = "cause" in error ? error.cause : undefined;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

// Serializes concurrent createRelationship calls for an organization so the
// symmetric/cycle pre-checks below can't both pass for two opposite-direction
// edges (A related B / B related A, or A blocks B / B blocks A) racing each
// other — the edge_key unique index is directional and doesn't catch a
// reversed pair, so without this a second writer's pre-checks can run before
// the first writer's insert commits. Org-scoped, not per-pair: this write
// path is low-frequency, so the extra serialization is cheap, and it avoids
// having to canonicalize a sorted pair-of-issue-ids lock key. Matches
// lockOrganizationJobBudget's pattern in organization-operation-budget.ts.
async function lockRelationshipMutations(tx: DatabaseTransaction, organizationId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${[
      "issue_sheet_relationships",
      organizationId,
    ].join(":")}, 0))`,
  );
}

function presentRelationshipKind(
  storedKind: IssueSheetRelationshipKind,
  direction: "outgoing" | "incoming",
): IssueRelationshipPresentedKind {
  if (storedKind === "related") {
    return "related";
  }
  if (storedKind === "blocks") {
    return direction === "outgoing" ? "blocks" : "blocked_by";
  }
  return direction === "outgoing" ? "duplicate_of" : "duplicate";
}

export class IssueRelationshipService extends ProjectServiceBase {
  constructor(database: typeof db = db) {
    super(database, "issue-relationship-service");
  }

  /**
   * The route authorizes the project id in the URL, but not that the issue id in
   * the URL lives in it. Without this, an accessible project id could be paired
   * with an issue from a project the actor cannot reach. Mirrors
   * IssueSheetCommentService.findIssue.
   */
  private async findIssue(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
  }): Promise<{ id: string } | null> {
    const [issue] = await this.database
      .select({ id: schema.issueSheetIssues.id })
      .from(schema.issueSheetIssues)
      .where(
        and(
          eq(schema.issueSheetIssues.id, input.issueId),
          eq(schema.issueSheetIssues.organizationId, input.organizationId),
          eq(schema.issueSheetIssues.projectId, input.projectId),
        ),
      )
      .limit(1);
    return issue ?? null;
  }

  private async insertRelationshipActivity(input: {
    database: DatabaseClient;
    type:
      | typeof ISSUE_SHEET_ACTIVITY_RELATIONSHIP_ADDED
      | typeof ISSUE_SHEET_ACTIVITY_RELATIONSHIP_REMOVED;
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
    relatedIssueId: string;
    relationshipKind: string;
  }) {
    await input.database.insert(schema.issueSheetActivities).values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      actorUserId: input.actorUserId,
      type: input.type,
      payload: { relatedIssueId: input.relatedIssueId, kind: input.relationshipKind },
      createdAt: sql`clock_timestamp()`,
    });
  }

  /**
   * All relationships touching `issueId`, from `issueId`'s point of view.
   * Targets outside the actor's accessible projects are omitted, not redacted.
   */
  async listRelationships(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    auth: ApiAuthContext;
  }): Promise<Result<IssueRelationship[], IssueRelationshipError>> {
    const issue = await this.findIssue(input);
    if (!issue) {
      return err({ code: "issue_not_found" });
    }

    const accessibleProjectsWhere = await buildAccessibleProjectsWhere(input.auth);

    const selectOtherIssue = {
      id: schema.issueSheetRelationships.id,
      kind: schema.issueSheetRelationships.kind,
      createdAt: schema.issueSheetRelationships.createdAt,
      otherIssueId: schema.issueSheetIssues.id,
      otherProjectId: schema.issueSheetIssues.projectId,
      otherTitle: schema.issueSheetIssues.title,
      otherStatus: schema.issueSheetIssues.status,
    };

    const outgoing = await this.database
      .select(selectOtherIssue)
      .from(schema.issueSheetRelationships)
      .innerJoin(
        schema.issueSheetIssues,
        eq(schema.issueSheetRelationships.relatedIssueId, schema.issueSheetIssues.id),
      )
      .innerJoin(schema.projects, eq(schema.issueSheetIssues.projectId, schema.projects.id))
      .where(
        and(
          eq(schema.issueSheetRelationships.organizationId, input.organizationId),
          eq(schema.issueSheetRelationships.issueId, input.issueId),
          accessibleProjectsWhere,
        ),
      );

    const incoming = await this.database
      .select(selectOtherIssue)
      .from(schema.issueSheetRelationships)
      .innerJoin(
        schema.issueSheetIssues,
        eq(schema.issueSheetRelationships.issueId, schema.issueSheetIssues.id),
      )
      .innerJoin(schema.projects, eq(schema.issueSheetIssues.projectId, schema.projects.id))
      .where(
        and(
          eq(schema.issueSheetRelationships.organizationId, input.organizationId),
          eq(schema.issueSheetRelationships.relatedIssueId, input.issueId),
          accessibleProjectsWhere,
        ),
      );

    const toRelationship = (
      row: (typeof outgoing)[number],
      direction: "outgoing" | "incoming",
    ): IssueRelationship => ({
      id: row.id,
      presentedKind: presentRelationshipKind(row.kind as IssueSheetRelationshipKind, direction),
      otherIssue: {
        issueId: row.otherIssueId,
        projectId: row.otherProjectId,
        title: row.otherTitle,
        status: row.otherStatus,
      },
      createdAt: row.createdAt.toISOString(),
    });

    return ok([
      ...outgoing.map((row) => toRelationship(row, "outgoing")),
      ...incoming.map((row) => toRelationship(row, "incoming")),
    ]);
  }

  async createRelationship(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
    relatedIssueId: string;
    kind: IssueRelationshipRequestKind;
    auth: ApiAuthContext;
  }): Promise<Result<IssueRelationship, IssueRelationshipError>> {
    const issue = await this.findIssue(input);
    if (!issue) {
      return err({ code: "issue_not_found" });
    }

    if (input.relatedIssueId === input.issueId) {
      return err({ code: "relationship_target_is_self" });
    }

    // Access-scoped target lookup, same shape as IssueSheetCommentService's
    // validateMentions: a miss reads as not-found, not forbidden, so this
    // never confirms the existence of an issue the actor can't see.
    const accessibleProjectsWhere = await buildAccessibleProjectsWhere(input.auth);
    const [target] = await this.database
      .select({
        id: schema.issueSheetIssues.id,
        projectId: schema.issueSheetIssues.projectId,
        title: schema.issueSheetIssues.title,
        status: schema.issueSheetIssues.status,
      })
      .from(schema.issueSheetIssues)
      .innerJoin(schema.projects, eq(schema.issueSheetIssues.projectId, schema.projects.id))
      .where(
        and(
          eq(schema.issueSheetIssues.organizationId, input.organizationId),
          eq(schema.issueSheetIssues.id, input.relatedIssueId),
          accessibleProjectsWhere,
        ),
      )
      .limit(1);
    if (!target) {
      return err({ code: "related_issue_not_found" });
    }

    // "blocked_by" is stored as its inverted "blocks" edge — see the module doc.
    const storedKind: IssueSheetRelationshipKind =
      input.kind === "blocked_by" ? "blocks" : input.kind;
    const storedIssueId = input.kind === "blocked_by" ? input.relatedIssueId : input.issueId;
    const storedRelatedIssueId = input.kind === "blocked_by" ? input.issueId : input.relatedIssueId;
    // The row's projectId mirrors the project of its own (stored) issueId column,
    // matching every sibling issue-sheet table's convention.
    const relationshipProjectId =
      storedIssueId === input.issueId ? input.projectId : target.projectId;

    try {
      // The symmetric/cycle checks below and the insert must run as one
      // serialized unit — see lockRelationshipMutations for why: without it,
      // two opposite-direction concurrent requests (A related B / B related A,
      // or A blocks B / B blocks A) can both pass validation before either
      // commits, since the DB's edge_key index is directional and doesn't
      // catch a reversed pair.
      const relationship = await this.database.transaction(async (tx) => {
        await lockRelationshipMutations(tx, input.organizationId);

        if (storedKind === "duplicate_of") {
          const [existingCanonical] = await tx
            .select({ id: schema.issueSheetRelationships.id })
            .from(schema.issueSheetRelationships)
            .where(
              and(
                eq(schema.issueSheetRelationships.organizationId, input.organizationId),
                eq(schema.issueSheetRelationships.issueId, storedIssueId),
                eq(schema.issueSheetRelationships.kind, "duplicate_of"),
              ),
            )
            .limit(1);
          if (existingCanonical) {
            throw new RelationshipConflictError("issue_already_marked_duplicate");
          }
        }

        if (storedKind === "related") {
          // Symmetric: a DB index alone can't normalize (A,B) vs (B,A), so check both.
          const [existingRelated] = await tx
            .select({ id: schema.issueSheetRelationships.id })
            .from(schema.issueSheetRelationships)
            .where(
              and(
                eq(schema.issueSheetRelationships.organizationId, input.organizationId),
                eq(schema.issueSheetRelationships.kind, "related"),
                or(
                  and(
                    eq(schema.issueSheetRelationships.issueId, storedIssueId),
                    eq(schema.issueSheetRelationships.relatedIssueId, storedRelatedIssueId),
                  ),
                  and(
                    eq(schema.issueSheetRelationships.issueId, storedRelatedIssueId),
                    eq(schema.issueSheetRelationships.relatedIssueId, storedIssueId),
                  ),
                ),
              ),
            )
            .limit(1);
          if (existingRelated) {
            throw new RelationshipConflictError("relationship_already_exists");
          }
        }

        if (storedKind === "blocks" || storedKind === "duplicate_of") {
          const cycle = await wouldCreateCycle({
            database: tx,
            organizationId: input.organizationId,
            kind: storedKind,
            fromIssueId: storedIssueId,
            toIssueId: storedRelatedIssueId,
          });
          if (cycle) {
            throw new RelationshipConflictError(
              storedKind === "blocks"
                ? "blocking_relationship_cycle"
                : "duplicate_relationship_cycle",
            );
          }
        }

        const [inserted] = await tx
          .insert(schema.issueSheetRelationships)
          .values({
            organizationId: input.organizationId,
            projectId: relationshipProjectId,
            issueId: storedIssueId,
            relatedIssueId: storedRelatedIssueId,
            kind: storedKind,
            createdByUserId: input.actorUserId,
          })
          .returning({
            id: schema.issueSheetRelationships.id,
            createdAt: schema.issueSheetRelationships.createdAt,
          });

        if (!inserted) {
          throw new Error("failed_to_insert_relationship");
        }

        // Logged on the actor's own issue/project, regardless of storage
        // direction, since that's the page the mutation was made from.
        await this.insertRelationshipActivity({
          database: tx,
          type: ISSUE_SHEET_ACTIVITY_RELATIONSHIP_ADDED,
          organizationId: input.organizationId,
          projectId: input.projectId,
          issueId: input.issueId,
          actorUserId: input.actorUserId,
          relatedIssueId: input.relatedIssueId,
          relationshipKind: input.kind,
        });

        return inserted;
      });

      return ok({
        id: relationship.id,
        presentedKind: input.kind,
        otherIssue: {
          issueId: target.id,
          projectId: target.projectId,
          title: target.title,
          status: target.status,
        },
        createdAt: relationship.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof RelationshipConflictError) {
        return err({ code: error.code });
      }
      // Belt-and-suspenders: the lock above serializes concurrent callers, so
      // this shouldn't fire from that race anymore, but keep it as a fallback
      // for the unique index itself.
      if (isUniqueViolation(error)) {
        return err({
          code:
            storedKind === "duplicate_of"
              ? "issue_already_marked_duplicate"
              : "relationship_already_exists",
        });
      }
      throw error;
    }
  }

  /** Works from either side of the relationship. Never touches either issue row. */
  async deleteRelationship(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    relationshipId: string;
    actorUserId: string;
  }): Promise<Result<void, IssueRelationshipError>> {
    const issue = await this.findIssue(input);
    if (!issue) {
      return err({ code: "issue_not_found" });
    }

    const [existing] = await this.database
      .select({
        id: schema.issueSheetRelationships.id,
        issueId: schema.issueSheetRelationships.issueId,
        relatedIssueId: schema.issueSheetRelationships.relatedIssueId,
        kind: schema.issueSheetRelationships.kind,
      })
      .from(schema.issueSheetRelationships)
      .where(
        and(
          eq(schema.issueSheetRelationships.organizationId, input.organizationId),
          eq(schema.issueSheetRelationships.id, input.relationshipId),
          or(
            eq(schema.issueSheetRelationships.issueId, input.issueId),
            eq(schema.issueSheetRelationships.relatedIssueId, input.issueId),
          ),
        ),
      )
      .limit(1);

    if (!existing) {
      return err({ code: "relationship_not_found" });
    }

    const direction: "outgoing" | "incoming" =
      existing.issueId === input.issueId ? "outgoing" : "incoming";
    const otherIssueId = direction === "outgoing" ? existing.relatedIssueId : existing.issueId;
    const presentedKind = presentRelationshipKind(
      existing.kind as IssueSheetRelationshipKind,
      direction,
    );

    await this.database.transaction(async (tx) => {
      await tx
        .delete(schema.issueSheetRelationships)
        .where(eq(schema.issueSheetRelationships.id, existing.id));

      await this.insertRelationshipActivity({
        database: tx,
        type: ISSUE_SHEET_ACTIVITY_RELATIONSHIP_REMOVED,
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: input.issueId,
        actorUserId: input.actorUserId,
        relatedIssueId: otherIssueId,
        relationshipKind: presentedKind,
      });
    });

    return ok(undefined);
  }
}

export const issueRelationshipService = new IssueRelationshipService();
