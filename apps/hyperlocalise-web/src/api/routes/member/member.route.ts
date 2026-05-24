import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { removeWorkosMembership } from "@/api/auth/workos-sync";
import { internalErrorResponse } from "@/api/response.schema";
import { db, schema } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import {
  getWorkosServerClient,
  isLocallyManagedWorkosOrganization,
} from "@/lib/workos/server-client";

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
  isInvitedPlaceholderWorkosUserId,
  isMemberListAllowed,
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

async function deleteMemberMcpSessions(organizationId: string, userId: string) {
  await db
    .delete(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.userId, userId),
        eq(schema.mcpSessions.organizationId, organizationId),
      ),
    );
}

function shouldSyncMembershipToWorkos(input: {
  workosMembershipId: string | null;
  workosOrganizationId: string;
}) {
  const workos = getWorkosServerClient();
  return (
    Boolean(input.workosMembershipId) &&
    workos !== null &&
    !isLocallyManagedWorkosOrganization(input.workosOrganizationId)
  );
}

async function inviteOrganizationMember(input: {
  organizationId: string;
  email: string;
  role: OrganizationMembershipRole;
  placeholderWorkosUserId: string;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();

  const existingMember = await db
    .select({ id: schema.users.id })
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

  if (existingMember[0]) {
    return { error: "member_already_exists" as const };
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
      },
      "",
    ),
  };
}

async function cleanupInvitedPlaceholderUser(localUserId: string) {
  const remainingMemberships = await db
    .select({ id: schema.organizationMemberships.id })
    .from(schema.organizationMemberships)
    .where(eq(schema.organizationMemberships.userId, localUserId))
    .limit(1);

  if (!remainingMemberships[0]) {
    await db.delete(schema.users).where(eq(schema.users.id, localUserId));
  }
}

async function revokePendingWorkosInvitation(input: {
  workosOrganizationId: string;
  email: string;
}) {
  const workos = getWorkosServerClient();
  if (!workos || isLocallyManagedWorkosOrganization(input.workosOrganizationId)) {
    return;
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const invitations = await workos.userManagement.listInvitations({
    organizationId: input.workosOrganizationId,
    email: normalizedEmail,
    limit: 10,
  });

  const pendingInvitation = invitations.data.find((invitation) => invitation.state === "pending");
  if (!pendingInvitation) {
    return;
  }

  await workos.userManagement.revokeInvitation(pendingInvitation.id);
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

      if (isLocallyManagedWorkosOrganization(workosOrganizationId)) {
        const result = await inviteOrganizationMember({
          organizationId,
          email: payload.email,
          role: payload.role,
          placeholderWorkosUserId: `local_user_${randomUUID()}`,
        });

        if ("error" in result) {
          return memberAlreadyExistsResponse(c);
        }

        return c.json(
          {
            member: {
              ...result.member,
              isCurrentUser: result.member.workosUserId === c.var.auth.user.workosUserId,
            },
          },
          201,
        );
      }

      const workos = getWorkosServerClient();
      if (!workos) {
        return forbiddenResponse(c);
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

      try {
        await workos.userManagement.sendInvitation({
          email: normalizedEmail,
          organizationId: workosOrganizationId,
          inviterUserId: c.var.auth.user.workosUserId,
          roleSlug: payload.role,
        });
      } catch {
        await rollbackPendingInvite({
          membershipId: pendingInvite.membershipId,
          localUserId: pendingInvite.localUserId,
          isNewUser: pendingInvite.isNewUser,
        });

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
        201,
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

      const workosOrganizationId = c.var.auth.organization.workosOrganizationId;
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
          workosOrganizationId,
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

      const removeResult = await db.transaction(async (tx) => {
        if (member.role === "owner") {
          const ownerCount = await lockOrganizationOwnersAndCount(tx, organizationId);
          if (ownerCount <= 1) {
            return { error: "last_owner_protected" as const };
          }
        }

        await removeWorkosMembership(tx, {
          workosMembershipId: member.workosMembershipId ?? undefined,
          workosOrganizationId,
          workosUserId: member.workosUserId,
        });

        return { ok: true as const };
      });

      if ("error" in removeResult) {
        return lastOwnerProtectedResponse(c);
      }

      const isPendingInvite = isInvitedPlaceholderWorkosUserId(member.workosUserId);

      if (
        shouldSyncMembershipToWorkos({
          workosMembershipId: member.workosMembershipId,
          workosOrganizationId,
        })
      ) {
        try {
          await workos!.userManagement.deleteOrganizationMembership(member.workosMembershipId!);
        } catch {
          await db.insert(schema.organizationMemberships).values({
            organizationId,
            userId: member.localUserId,
            role: member.role,
            workosMembershipId: member.workosMembershipId,
          });

          return internalErrorResponse(
            c,
            "member_sync_failed",
            "Failed to sync member removal with identity provider",
          );
        }
      } else if (isPendingInvite) {
        try {
          await revokePendingWorkosInvitation({
            workosOrganizationId,
            email: member.email,
          });
        } catch {
          await db.insert(schema.organizationMemberships).values({
            organizationId,
            userId: member.localUserId,
            role: member.role,
            workosMembershipId: member.workosMembershipId,
          });

          return internalErrorResponse(
            c,
            "member_sync_failed",
            "Failed to revoke workspace invitation with identity provider",
          );
        }
      }

      if (isPendingInvite) {
        await cleanupInvitedPlaceholderUser(member.localUserId);
      }

      await deleteMemberMcpSessions(organizationId, member.localUserId);

      return c.body(null, 204);
    });
}
