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
import { and, eq, exists, inArray, isNotNull, ne, type SQL } from "drizzle-orm";

import { hasCapability } from "@/api/auth/policy";
import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { organizationMembershipRoleEnum } from "@/lib/database/schema/enums";
import { excludeReplacingWorkosMembershipSql } from "@/lib/workos/constants";
import { updateJobs } from "@/lib/job-change-events/job-writes";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import { canOwnFileTaskOutsideTeam } from "./job-owner";
import { fileTaskWhere } from "./task-access";

/**
 * Tasks given to a vendor team. An open or waiting post-edit or proofread task on a file can be
 * given to a vendor team instead of a person (`jobs.owner_team_id`). The team's managers (team
 * role Manager) see every such task of the team, its page included, and hand each one to a
 * person in the team or back to the team. They work on it only once they own it. Everyone else in
 * the team sees only the tasks they own, as before (`task-access.ts`).
 *
 * The Go service keeps the same rule in `managedTeamTaskSQL` in apps/go-svc/vendor-access.go.
 * Keep them in step.
 */
export function managedTeamTaskWhere(input: { organizationId: string; userId: string }): SQL {
  return and(
    eq(schema.jobs.organizationId, input.organizationId),
    inArray(
      schema.jobs.ownerTeamId,
      db
        .select({ teamId: schema.teamMemberships.teamId })
        .from(schema.teamMemberships)
        .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMemberships.teamId))
        .where(
          and(
            eq(schema.teamMemberships.userId, input.userId),
            eq(schema.teamMemberships.role, "manager"),
            eq(schema.teams.isVendor, true),
            eq(schema.teams.organizationId, input.organizationId),
          ),
        ),
    ),
    fileTaskWhere(true),
  )!;
}

/** The task with this id when it was given to a vendor team the person manages, or null. */
export async function findManagedTeamTask(input: {
  organizationId: string;
  userId: string;
  jobId: string;
  database?: DatabaseClient;
}): Promise<{ jobId: string; projectId: string } | null> {
  const [job] = await (input.database ?? db)
    .select({ id: schema.jobs.id, projectId: schema.jobs.projectId })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.id, input.jobId), managedTeamTaskWhere(input)))
    .limit(1);
  return job?.projectId ? { jobId: job.id, projectId: job.projectId } : null;
}

/** Roles that work on jobs: the Member role only reads. */
const JOB_WORKER_ROLES = organizationMembershipRoleEnum.enumValues.filter((role) =>
  hasCapability(role, "jobs:write"),
);

/**
 * Whether a task can be given to the team: a vendor team of the workspace with a manager who is an
 * active member whose role works on jobs. A team with none would hold the task where no one sees
 * it. Keep in step with `assignableVendorTeamSQL` in apps/go-svc/project-jobs.go.
 */
export async function isAssignableVendorTeam(input: {
  organizationId: string;
  teamId: string;
  database?: DatabaseClient;
}): Promise<boolean> {
  const database = input.database ?? db;
  const [team] = await database
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(
      and(
        eq(schema.teams.id, input.teamId),
        eq(schema.teams.organizationId, input.organizationId),
        eq(schema.teams.isVendor, true),
        exists(
          database
            .select({ id: schema.teamMemberships.id })
            .from(schema.teamMemberships)
            .innerJoin(
              schema.organizationMemberships,
              and(
                eq(schema.organizationMemberships.userId, schema.teamMemberships.userId),
                eq(schema.organizationMemberships.organizationId, input.organizationId),
              ),
            )
            .where(
              and(
                eq(schema.teamMemberships.teamId, schema.teams.id),
                eq(schema.teamMemberships.role, "manager"),
                inArray(schema.organizationMemberships.role, JOB_WORKER_ROLES),
                // An active member: invited and accepted, not being replaced.
                isNotNull(schema.organizationMemberships.workosMembershipId),
                ne(schema.organizationMemberships.workosMembershipId, ""),
                excludeReplacingWorkosMembershipSql(
                  schema.organizationMemberships.workosMembershipId,
                ),
              ),
            ),
        ),
      ),
    )
    .limit(1);
  return Boolean(team);
}

export type HandOutTeamTaskError =
  | { code: "job_not_found" }
  | { code: "assignee_not_assignable"; message: string };

/**
 * A team manager hands a task of their team to a person in the team, whose role must work on
 * jobs, or back to the team (`ownerUserId` null). The task stays the team's either way.
 */
export async function handOutTeamTask(input: {
  organizationId: string;
  jobId: string;
  managerUserId: string;
  ownerUserId: string | null;
  database?: DatabaseClient;
}): Promise<
  Result<{ id: string; projectId: string | null; ownerUserId: string | null }, HandOutTeamTaskError>
> {
  return (input.database ?? db).transaction(async (tx) => {
    const [job] = await tx
      .select({ id: schema.jobs.id, ownerTeamId: schema.jobs.ownerTeamId })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.id, input.jobId),
          managedTeamTaskWhere({
            organizationId: input.organizationId,
            userId: input.managerUserId,
          }),
        ),
      )
      .limit(1)
      .for("update", { of: schema.jobs });
    if (!job?.ownerTeamId) {
      return err({ code: "job_not_found" as const });
    }

    if (input.ownerUserId !== null) {
      const [inTeam] = await tx
        .select({ id: schema.teamMemberships.id })
        .from(schema.teamMemberships)
        .where(
          and(
            eq(schema.teamMemberships.teamId, job.ownerTeamId),
            eq(schema.teamMemberships.userId, input.ownerUserId),
          ),
        )
        .limit(1);
      const assignable =
        Boolean(inTeam) &&
        (await canOwnFileTaskOutsideTeam({
          organizationId: input.organizationId,
          userId: input.ownerUserId,
          database: tx,
        }));
      if (!assignable) {
        return err({
          code: "assignee_not_assignable" as const,
          message: "A team task can only be handed to a person in the team who works on jobs",
        });
      }
    }

    const [updated] = await updateJobs(tx, {
      set: {
        ownerUserId: input.ownerUserId,
        assigneeType: input.ownerUserId ? "user" : null,
        updatedAt: new Date(),
      },
      where: and(
        eq(schema.jobs.id, input.jobId),
        eq(schema.jobs.organizationId, input.organizationId),
      ),
      returning: {
        id: schema.jobs.id,
        projectId: schema.jobs.projectId,
        ownerUserId: schema.jobs.ownerUserId,
      },
    });
    return updated ? ok(updated) : err({ code: "job_not_found" as const });
  });
}
