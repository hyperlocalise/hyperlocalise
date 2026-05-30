import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { revokeOrganizationMembershipAccess } from "@/api/auth/workos-sync";
import { internalErrorResponse, serviceUnavailableResponse } from "@/api/response.schema";
import { db, schema } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { getWorkosServerClient } from "@/lib/workos/server-client";

import {
  inviteMemberBodySchema,
  memberWorkosUserIdParamsSchema,
  updateMemberBodySchema,
} from "./member.schema";
import {
  canActorManageTarget,
  cannotManageOwnerResponse,
  forbiddenResponse,
  getOrganizationMember,
  invalidMemberPayloadResponse,
  INVITED_WORKOS_USER_ID_PREFIX,
  isActiveOrganizationMembership,
  isMemberListAllowed,
  isPendingOrganizationMembership,
  shouldCleanupPlaceholderUserOnMemberRemoval,
  isMemberManageAllowed,
  lastOwnerProtectedResponse,
  lockOrganizationOwnersAndCount,
  memberAlreadyExistsResponse,
  memberNotFoundResponse,
  toMemberSummary,
} from "./member.shared";

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
  return Boolean(input.workosMembershipId) && workos !== null;
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

async function deliverWorkosInvitation(input: {
  workosOrganizationId: string;
  email: string;
  inviterUserId: string;
  roleSlug: OrganizationMembershipRole;
  replacePendingInvitation?: boolean;
}) {
  const workos = getWorkosServerClient();
  if (!workos) {
    throw new Error("workos_not_configured");
  }

  const pendingInvitation = await findPendingWorkosInvitation({
    workosOrganizationId: input.workosOrganizationId,
    email: input.email,
  });

  if (pendingInvitation && input.replacePendingInvitation) {
    await workos.userManagement.revokeInvitation(pendingInvitation.id);
  } else if (pendingInvitation) {
    await workos.userManagement.resendInvitation(pendingInvitation.id);
    return;
  }

  await workos.userManagement.sendInvitation({
    email: input.email.trim().toLowerCase(),
    organizationId: input.workosOrganizationId,
    inviterUserId: input.inviterUserId,
    roleSlug: input.roleSlug,
  });
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

      return c.json(
        {
          members: rows.map((row) => toMemberSummary(row, c.var.auth.user.workosUserId)),
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

      if (payload.role === "owner" && !canActorManageTarget(actorRole, "member", "owner")) {
        return cannotManageOwnerResponse(c);
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
          replacePendingInvitation:
            isResend && "roleChanged" in pendingInvite && pendingInvite.roleChanged,
        });
      } catch {
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
        return cannotManageOwnerResponse(c);
      }

      const workos = getWorkosServerClient();
      const previousRole = member.role;

      const updateResult = await db.transaction(async (tx) => {
        if (member.role === "owner" && payload.role !== "owner") {
          const ownerCount = await lockOrganizationOwnersAndCount(tx, organizationId);
          if (ownerCount <= 1) {
            return { error: "last_owner_protected" as const };
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
        return lastOwnerProtectedResponse(c);
      }

      const { updated } = updateResult;

      if (
        shouldSyncMembershipToWorkos({
          workosMembershipId: member.workosMembershipId,
        })
      ) {
        try {
          await workos!.userManagement.updateOrganizationMembership(member.workosMembershipId!, {
            roleSlug: payload.role,
          });
        } catch {
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
      }

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
        return cannotManageOwnerResponse(c);
      }

      const workosOrganizationId = c.var.auth.organization.workosOrganizationId;
      const workos = getWorkosServerClient();
      const isPendingInvite = isPendingOrganizationMembership(member.workosMembershipId);

      if (member.role === "owner") {
        const ownerGuardResult = await db.transaction(async (tx) => {
          const ownerCount = await lockOrganizationOwnersAndCount(tx, organizationId);
          if (ownerCount <= 1) {
            return { error: "last_owner_protected" as const };
          }

          return { ok: true as const };
        });

        if ("error" in ownerGuardResult) {
          return lastOwnerProtectedResponse(c);
        }
      }

      if (
        shouldSyncMembershipToWorkos({
          workosMembershipId: member.workosMembershipId,
        })
      ) {
        try {
          await workos!.userManagement.deleteOrganizationMembership(member.workosMembershipId!);
        } catch {
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
        } catch {
          return internalErrorResponse(
            c,
            "member_sync_failed",
            "Failed to revoke workspace invitation with identity provider",
          );
        }
      }

      const deletionResult = await db.transaction(async (tx) => {
        if (member.role === "owner") {
          const ownerCount = await lockOrganizationOwnersAndCount(tx, organizationId);
          if (ownerCount <= 1) {
            return { error: "last_owner_protected" as const };
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
        return lastOwnerProtectedResponse(c);
      }

      if (shouldCleanupPlaceholderUserOnMemberRemoval(member.workosUserId)) {
        await cleanupInvitedPlaceholderUser(member.localUserId);
      }

      return c.body(null, 204);
    });
}
