import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { reconcileWorkosMembershipsForUser } from "@/api/auth/workos-membership-reconcile";
import {
  clearPendingMembershipReplacingInvitation,
  markPendingMembershipReplacingInvitation,
  revokeOrganizationMembershipAccess,
} from "@/api/auth/workos-sync";
import {
  conflictResponse,
  internalErrorResponse,
  serviceUnavailableResponse,
} from "@/api/response.schema";
import {
  ensureWorkspaceResourceLimitAvailable,
  workspaceResourceFeatureIds,
  workspaceResourceLimitErrorDetails,
  workspaceResourceLimitMessage,
} from "@/lib/billing/workspace-resource-limits";
import { db, schema } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { createLogger, serializeErrorForLog } from "@/lib/log";
import { membershipRoleToWorkosRoleSlug } from "@/lib/workos/membership-role";
import { getWorkosServerClient } from "@/lib/workos/server-client";

import {
  inviteMemberBodySchema,
  memberWorkosUserIdParamsSchema,
  updateMemberBodySchema,
} from "./member.schema";
import {
  buildMemberManagementContext,
  canActorAssignRole,
  canActorManageTarget,
  cannotManageMemberResponse,
  forbiddenResponse,
  getOrganizationMember,
  invalidMemberPayloadResponse,
  INVITED_WORKOS_USER_ID_PREFIX,
  isActiveOrganizationMembership,
  isMemberListAllowed,
  isPendingOrganizationMembership,
  shouldCleanupPlaceholderUserOnMemberRemoval,
  isMemberManageAllowed,
  lastAdminProtectedResponse,
  lockOrganizationAdminsAndCount,
  memberAlreadyExistsResponse,
  memberNotFoundResponse,
  toMemberSummary,
} from "./member.shared";

const logger = createLogger("member-route");

const validateInviteMemberBody = validator("json", (value, c) => {
  const parsed = inviteMemberBodySchema.safeParse(value);
  if (!parsed.success) {
    return invalidMemberPayloadResponse(c, parsed.error.issues);
  }
  return parsed.data;
});

const validateUpdateMemberBody = validator("json", (value, c) => {
  const parsed = updateMemberBodySchema.safeParse(value);
  if (!parsed.success) {
    return invalidMemberPayloadResponse(c, parsed.error.issues);
  }
  return parsed.data;
});

const validateMemberParams = validator("param", (value, c) => {
  const parsed = memberWorkosUserIdParamsSchema.safeParse(value);
  if (!parsed.success) {
    return memberNotFoundResponse(c);
  }
  return parsed.data;
});

function shouldSyncMembershipToWorkos(input: { workosMembershipId: string | null }) {
  const workos = getWorkosServerClient();
  return isActiveOrganizationMembership(input.workosMembershipId) && workos !== null;
}

async function reconcileMemberMembershipFromWorkos(input: {
  workosUserId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  workosOrganizationId: string;
}) {
  await reconcileWorkosMembershipsForUser(db, {
    workosUserId: input.workosUserId,
    email: input.email,
    firstName: input.firstName ?? undefined,
    lastName: input.lastName ?? undefined,
    workosOrganizationId: input.workosOrganizationId,
    force: true,
  });
}

async function inviteOrganizationMember(input: {
  organizationId: string;
  email: string;
  role: OrganizationMembershipRole;
  placeholderWorkosUserId: string;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();

  const [existingMembership] = await db
    .select({
      membershipId: schema.organizationMemberships.id,
      workosMembershipId: schema.organizationMemberships.workosMembershipId,
      role: schema.organizationMemberships.role,
      createdAt: schema.organizationMemberships.createdAt,
      localUserId: schema.users.id,
      workosUserId: schema.users.workosUserId,
      email: schema.users.email,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.users)
    .innerJoin(
      schema.organizationMemberships,
      eq(schema.organizationMemberships.userId, schema.users.id),
    )
    .where(
      and(
        eq(schema.organizationMemberships.organizationId, input.organizationId),
        eq(schema.users.email, normalizedEmail),
      ),
    )
    .limit(1);

  if (existingMembership) {
    if (isActiveOrganizationMembership(existingMembership.workosMembershipId)) {
      return { error: "member_already_exists" as const };
    }

    const roleChanged = existingMembership.role !== input.role;
    const previousRole = existingMembership.role;

    if (roleChanged) {
      await db
        .update(schema.organizationMemberships)
        .set({ role: input.role })
        .where(eq(schema.organizationMemberships.id, existingMembership.membershipId));
    }

    return {
      resend: true as const,
      roleChanged,
      previousRole,
      membershipId: existingMembership.membershipId,
      localUserId: existingMembership.localUserId,
      isNewUser: false,
      member: toMemberSummary(
        {
          workosUserId: existingMembership.workosUserId,
          email: existingMembership.email,
          firstName: existingMembership.firstName,
          lastName: existingMembership.lastName,
          role: input.role,
          createdAt: existingMembership.createdAt,
          workosMembershipId: existingMembership.workosMembershipId,
        },
        "",
      ),
    };
  }

  const [existingUser] = await db
    .select({
      id: schema.users.id,
      workosUserId: schema.users.workosUserId,
      email: schema.users.email,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);

  const isNewUser = !existingUser;

  const user =
    existingUser ??
    (
      await db
        .insert(schema.users)
        .values({
          workosUserId: input.placeholderWorkosUserId,
          email: normalizedEmail,
        })
        .returning({
          id: schema.users.id,
          workosUserId: schema.users.workosUserId,
          email: schema.users.email,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
        })
    )[0];

  const [membership] = await db
    .insert(schema.organizationMemberships)
    .values({
      organizationId: input.organizationId,
      userId: user.id,
      role: input.role,
      workosMembershipId: null,
    })
    .returning({
      id: schema.organizationMemberships.id,
      role: schema.organizationMemberships.role,
      createdAt: schema.organizationMemberships.createdAt,
    });

  return {
    membershipId: membership.id,
    localUserId: user.id,
    isNewUser,
    member: toMemberSummary(
      {
        workosUserId: user.workosUserId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: membership.role,
        createdAt: membership.createdAt,
        workosMembershipId: null,
      },
      "",
    ),
  };
}

async function cleanupInvitedPlaceholderUser(localUserId: string) {
  await db.delete(schema.users).where(
    and(
      eq(schema.users.id, localUserId),
      sql`not exists (
        select 1
        from ${schema.organizationMemberships}
        where ${schema.organizationMemberships.userId} = ${schema.users.id}
      )`,
    ),
  );
}

async function findPendingWorkosInvitation(input: { workosOrganizationId: string; email: string }) {
  const workos = getWorkosServerClient();
  if (!workos) {
    return null;
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const invitations = await workos.userManagement.listInvitations({
    organizationId: input.workosOrganizationId,
    email: normalizedEmail,
    limit: 10,
  });

  return invitations.data.find((invitation) => invitation.state === "pending") ?? null;
}

async function revokePendingWorkosInvitation(input: {
  workosOrganizationId: string;
  email: string;
}) {
  const pendingInvitation = await findPendingWorkosInvitation(input);
  if (!pendingInvitation) {
    return;
  }

  const workos = getWorkosServerClient();
  if (!workos) {
    return;
  }

  await workos.userManagement.revokeInvitation(pendingInvitation.id);
}

class WorkosInvitationRevokedNotDeliveredError extends Error {
  readonly code = "member_invite_revoked_not_delivered" as const;
  override cause?: unknown;

  constructor(cause?: unknown) {
    super("WorkOS invitation was revoked but a replacement could not be sent");
    this.name = "WorkosInvitationRevokedNotDeliveredError";
    this.cause = cause;
  }
}

function isWorkosInvitationRevokedNotDeliveredError(
  error: unknown,
): error is WorkosInvitationRevokedNotDeliveredError {
  return error instanceof WorkosInvitationRevokedNotDeliveredError;
}

async function sendWorkosInvitation(
  workos: NonNullable<ReturnType<typeof getWorkosServerClient>>,
  input: {
    workosOrganizationId: string;
    email: string;
    inviterUserId: string;
    roleSlug: OrganizationMembershipRole;
  },
) {
  await workos.userManagement.sendInvitation({
    email: input.email.trim().toLowerCase(),
    organizationId: input.workosOrganizationId,
    inviterUserId: input.inviterUserId,
    roleSlug: membershipRoleToWorkosRoleSlug(input.roleSlug),
  });
}

async function deliverWorkosInvitation(input: {
  workosOrganizationId: string;
  email: string;
  inviterUserId: string;
  roleSlug: OrganizationMembershipRole;
  replacePendingInvitation?: boolean;
  localMembershipId?: string;
}) {
  const workos = getWorkosServerClient();
  if (!workos) {
    throw new Error("workos_not_configured");
  }

  const pendingInvitation = await findPendingWorkosInvitation({
    workosOrganizationId: input.workosOrganizationId,
    email: input.email,
  });

  const invitationPayload = {
    workosOrganizationId: input.workosOrganizationId,
    email: input.email,
    inviterUserId: input.inviterUserId,
    roleSlug: input.roleSlug,
  };

  if (pendingInvitation && input.replacePendingInvitation) {
    const markedReplacing = input.localMembershipId
      ? await markPendingMembershipReplacingInvitation(db, input.localMembershipId)
      : false;

    try {
      await workos.userManagement.revokeInvitation(pendingInvitation.id);
      try {
        await sendWorkosInvitation(workos, invitationPayload);
      } catch (firstError) {
        try {
          await sendWorkosInvitation(workos, invitationPayload);
        } catch (retryError) {
          throw new WorkosInvitationRevokedNotDeliveredError({ firstError, retryError });
        }
      }
    } finally {
      if (markedReplacing && input.localMembershipId) {
        await clearPendingMembershipReplacingInvitation(db, input.localMembershipId);
      }
    }
    return;
  }

  if (pendingInvitation) {
    await workos.userManagement.resendInvitation(pendingInvitation.id);
    return;
  }

  await sendWorkosInvitation(workos, invitationPayload);
}

async function rollbackPendingInvite(input: {
  membershipId: string;
  localUserId: string;
  isNewUser: boolean;
}) {
  await db
    .delete(schema.organizationMemberships)
    .where(eq(schema.organizationMemberships.id, input.membershipId));

  if (!input.isNewUser) {
    return;
  }

  await cleanupInvitedPlaceholderUser(input.localUserId);
}

export function createMemberRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!isMemberListAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const rows = await db
        .select({
          workosUserId: schema.users.workosUserId,
          email: schema.users.email,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          avatarUrl: schema.users.avatarUrl,
          role: schema.organizationMemberships.role,
          createdAt: schema.organizationMemberships.createdAt,
          workosMembershipId: schema.organizationMemberships.workosMembershipId,
        })
        .from(schema.organizationMemberships)
        .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
        .where(
          eq(
            schema.organizationMemberships.organizationId,
            c.var.auth.organization.localOrganizationId,
          ),
        )
        .orderBy(schema.organizationMemberships.createdAt);

      const actorRole = c.var.auth.membership.role;

      return c.json(
        {
          members: rows.map((row) => toMemberSummary(row, c.var.auth.user.workosUserId, actorRole)),
          memberManagement: buildMemberManagementContext(actorRole),
        },
        200,
      );
    })
    .post("/", validateInviteMemberBody, async (c) => {
      if (!isMemberManageAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      const actorRole = c.var.auth.membership.role;

      if (!canActorAssignRole(actorRole, payload.role)) {
        return cannotManageMemberResponse(c);
      }

      const organizationId = c.var.auth.organization.localOrganizationId;
      const workosOrganizationId = c.var.auth.organization.workosOrganizationId;
      const workos = getWorkosServerClient();
      if (!workos) {
        return serviceUnavailableResponse(
          c,
          "workos_server_not_configured",
          "WorkOS server integration is not configured",
        );
      }

      const normalizedEmail = payload.email.trim().toLowerCase();
      const [existingMembershipForEmail] = await db
        .select({ id: schema.organizationMemberships.id })
        .from(schema.users)
        .innerJoin(
          schema.organizationMemberships,
          eq(schema.organizationMemberships.userId, schema.users.id),
        )
        .where(
          and(
            eq(schema.organizationMemberships.organizationId, organizationId),
            eq(schema.users.email, normalizedEmail),
          ),
        )
        .limit(1);

      if (!existingMembershipForEmail) {
        const limitResult = await ensureWorkspaceResourceLimitAvailable({
          organizationId,
          featureId: workspaceResourceFeatureIds.seats,
        });
        if (!limitResult.ok) {
          if (limitResult.error.code === "workspace_resource_limit_check_failed") {
            return serviceUnavailableResponse(
              c,
              limitResult.error.code,
              "Unable to verify seat limits. Try again later.",
            );
          }

          return conflictResponse(
            c,
            limitResult.error.code,
            workspaceResourceLimitMessage(limitResult.error.featureId),
            workspaceResourceLimitErrorDetails(limitResult.error),
          );
        }
      }

      const pendingInvite = await inviteOrganizationMember({
        organizationId,
        email: normalizedEmail,
        role: payload.role,
        placeholderWorkosUserId: `${INVITED_WORKOS_USER_ID_PREFIX}${randomUUID()}`,
      });

      if ("error" in pendingInvite) {
        return memberAlreadyExistsResponse(c);
      }

      const isResend = "resend" in pendingInvite && pendingInvite.resend;

      try {
        await deliverWorkosInvitation({
          workosOrganizationId,
          email: normalizedEmail,
          inviterUserId: c.var.auth.user.workosUserId,
          roleSlug: payload.role,
          localMembershipId: pendingInvite.membershipId,
          replacePendingInvitation:
            !isResend || ("roleChanged" in pendingInvite && pendingInvite.roleChanged),
        });
      } catch (error) {
        logger.error(
          {
            err: serializeErrorForLog(error),
            organizationId,
            workosOrganizationId,
            membershipId: pendingInvite.membershipId,
            localUserId: pendingInvite.localUserId,
            actorWorkosUserId: c.var.auth.user.workosUserId,
            role: payload.role,
            isResend,
            roleChanged: "roleChanged" in pendingInvite ? pendingInvite.roleChanged : false,
          },
          "workspace member invitation delivery failed",
        );

        if (!isResend) {
          await rollbackPendingInvite({
            membershipId: pendingInvite.membershipId,
            localUserId: pendingInvite.localUserId,
            isNewUser: pendingInvite.isNewUser,
          });
        } else if (
          "roleChanged" in pendingInvite &&
          pendingInvite.roleChanged &&
          "previousRole" in pendingInvite
        ) {
          await db
            .update(schema.organizationMemberships)
            .set({ role: pendingInvite.previousRole })
            .where(eq(schema.organizationMemberships.id, pendingInvite.membershipId));
        }

        if (isWorkosInvitationRevokedNotDeliveredError(error)) {
          return internalErrorResponse(
            c,
            error.code,
            "The previous invitation was revoked but a new one could not be sent. Invite this member again.",
          );
        }

        return internalErrorResponse(
          c,
          "member_invite_failed",
          "Failed to send workspace invitation",
        );
      }

      return c.json(
        {
          member: {
            ...pendingInvite.member,
            isCurrentUser: false,
          },
        },
        isResend ? 200 : 201,
      );
    })
    .patch("/:workosUserId", validateMemberParams, validateUpdateMemberBody, async (c) => {
      if (!isMemberManageAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const payload = c.req.valid("json");
      const actorRole = c.var.auth.membership.role;
      const organizationId = c.var.auth.organization.localOrganizationId;

      const member = await getOrganizationMember(organizationId, params.workosUserId);
      if (!member) {
        return memberNotFoundResponse(c);
      }

      if (!canActorManageTarget(actorRole, member.role, payload.role)) {
        return cannotManageMemberResponse(c);
      }

      const workos = getWorkosServerClient();
      const previousRole = member.role;

      const updateResult = await db.transaction(async (tx) => {
        if (member.role === "admin" && payload.role !== "admin") {
          const adminCount = await lockOrganizationAdminsAndCount(tx, organizationId);
          if (adminCount <= 1) {
            return { error: "last_admin_protected" as const };
          }
        }

        const [updated] = await tx
          .update(schema.organizationMemberships)
          .set({ role: payload.role })
          .where(eq(schema.organizationMemberships.id, member.membershipId))
          .returning({
            role: schema.organizationMemberships.role,
            createdAt: schema.organizationMemberships.createdAt,
          });

        return { updated };
      });

      if ("error" in updateResult) {
        return lastAdminProtectedResponse(c);
      }

      const { updated } = updateResult;
      const roleChanged = previousRole !== payload.role;
      const isPendingInvite = isPendingOrganizationMembership(member.workosMembershipId);
      const workosOrganizationId = c.var.auth.organization.workosOrganizationId;

      if (
        shouldSyncMembershipToWorkos({
          workosMembershipId: member.workosMembershipId,
        })
      ) {
        try {
          await workos!.userManagement.updateOrganizationMembership(member.workosMembershipId!, {
            roleSlug: membershipRoleToWorkosRoleSlug(payload.role),
          });
        } catch (error) {
          logger.error(
            {
              err: serializeErrorForLog(error),
              organizationId,
              workosOrganizationId,
              membershipId: member.membershipId,
              workosMembershipId: member.workosMembershipId,
              actorWorkosUserId: c.var.auth.user.workosUserId,
              targetWorkosUserId: member.workosUserId,
              previousRole,
              role: payload.role,
            },
            "workspace member role sync failed",
          );

          await db
            .update(schema.organizationMemberships)
            .set({ role: previousRole })
            .where(eq(schema.organizationMemberships.id, member.membershipId));

          return internalErrorResponse(
            c,
            "member_sync_failed",
            "Failed to sync member role with identity provider",
          );
        }
      } else if (isPendingInvite && roleChanged) {
        if (!workos) {
          await db
            .update(schema.organizationMemberships)
            .set({ role: previousRole })
            .where(eq(schema.organizationMemberships.id, member.membershipId));

          return serviceUnavailableResponse(
            c,
            "workos_server_not_configured",
            "WorkOS server integration is not configured",
          );
        }

        try {
          await deliverWorkosInvitation({
            workosOrganizationId,
            email: member.email,
            inviterUserId: c.var.auth.user.workosUserId,
            roleSlug: payload.role,
            localMembershipId: member.membershipId,
            replacePendingInvitation: true,
          });
        } catch (error) {
          logger.error(
            {
              err: serializeErrorForLog(error),
              organizationId,
              workosOrganizationId,
              membershipId: member.membershipId,
              actorWorkosUserId: c.var.auth.user.workosUserId,
              targetWorkosUserId: member.workosUserId,
              previousRole,
              role: payload.role,
            },
            "workspace pending invitation role update failed",
          );

          await db
            .update(schema.organizationMemberships)
            .set({ role: previousRole })
            .where(eq(schema.organizationMemberships.id, member.membershipId));

          if (isWorkosInvitationRevokedNotDeliveredError(error)) {
            return internalErrorResponse(
              c,
              error.code,
              "The previous invitation was revoked but a new one could not be sent. Invite this member again.",
            );
          }

          return internalErrorResponse(
            c,
            "member_sync_failed",
            "Failed to sync member role with identity provider",
          );
        }
      }

      await reconcileMemberMembershipFromWorkos({
        workosUserId: member.workosUserId,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        workosOrganizationId,
      });

      return c.json(
        {
          member: toMemberSummary(
            {
              workosUserId: member.workosUserId,
              email: member.email,
              firstName: member.firstName,
              lastName: member.lastName,
              role: updated.role,
              createdAt: updated.createdAt,
              workosMembershipId: member.workosMembershipId,
            },
            c.var.auth.user.workosUserId,
          ),
        },
        200,
      );
    })
    .delete("/:workosUserId", validateMemberParams, async (c) => {
      if (!isMemberManageAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const actorRole = c.var.auth.membership.role;
      const organizationId = c.var.auth.organization.localOrganizationId;

      const member = await getOrganizationMember(organizationId, params.workosUserId);
      if (!member) {
        return c.body(null, 204);
      }

      if (!canActorManageTarget(actorRole, member.role)) {
        return cannotManageMemberResponse(c);
      }

      const workosOrganizationId = c.var.auth.organization.workosOrganizationId;
      const workos = getWorkosServerClient();
      const isPendingInvite = isPendingOrganizationMembership(member.workosMembershipId);

      if (member.role === "admin") {
        const adminGuardResult = await db.transaction(async (tx) => {
          const adminCount = await lockOrganizationAdminsAndCount(tx, organizationId);
          if (adminCount <= 1) {
            return { error: "last_admin_protected" as const };
          }

          return { ok: true as const };
        });

        if ("error" in adminGuardResult) {
          return lastAdminProtectedResponse(c);
        }
      }

      if (
        shouldSyncMembershipToWorkos({
          workosMembershipId: member.workosMembershipId,
        })
      ) {
        try {
          await workos!.userManagement.deleteOrganizationMembership(member.workosMembershipId!);
        } catch (error) {
          logger.error(
            {
              err: serializeErrorForLog(error),
              organizationId,
              workosOrganizationId,
              membershipId: member.membershipId,
              workosMembershipId: member.workosMembershipId,
              actorWorkosUserId: c.var.auth.user.workosUserId,
              targetWorkosUserId: member.workosUserId,
            },
            "workspace member removal sync failed",
          );

          return internalErrorResponse(
            c,
            "member_sync_failed",
            "Failed to sync member removal with identity provider",
          );
        }
      } else if (isPendingInvite && workos) {
        try {
          await revokePendingWorkosInvitation({
            workosOrganizationId,
            email: member.email,
          });
        } catch (error) {
          logger.error(
            {
              err: serializeErrorForLog(error),
              organizationId,
              workosOrganizationId,
              membershipId: member.membershipId,
              actorWorkosUserId: c.var.auth.user.workosUserId,
              targetWorkosUserId: member.workosUserId,
            },
            "workspace pending invitation revoke failed",
          );

          return internalErrorResponse(
            c,
            "member_sync_failed",
            "Failed to revoke workspace invitation with identity provider",
          );
        }
      }

      const deletionResult = await db.transaction(async (tx) => {
        if (member.role === "admin") {
          const adminCount = await lockOrganizationAdminsAndCount(tx, organizationId);
          if (adminCount <= 1) {
            return { error: "last_admin_protected" as const };
          }
        }

        await revokeOrganizationMembershipAccess(tx, {
          workosMembershipId: member.workosMembershipId ?? undefined,
          workosOrganizationId,
          workosUserId: member.workosUserId,
        });

        return { ok: true as const };
      });

      if ("error" in deletionResult) {
        return lastAdminProtectedResponse(c);
      }

      if (shouldCleanupPlaceholderUserOnMemberRemoval(member.workosUserId)) {
        await cleanupInvitedPlaceholderUser(member.localUserId);
      }

      return c.body(null, 204);
    });
}
