import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { removeWorkosMembership } from "@/api/auth/workos-sync";
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
  countOrganizationOwners,
  forbiddenResponse,
  getOrganizationMember,
  invalidMemberPayloadResponse,
  isMemberListAllowed,
  isMemberManageAllowed,
  lastOwnerProtectedResponse,
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

async function inviteLocalMember(input: {
  organizationId: string;
  email: string;
  role: OrganizationMembershipRole;
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

  const user =
    existingUser ??
    (
      await db
        .insert(schema.users)
        .values({
          workosUserId: `local_user_${randomUUID()}`,
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
      role: schema.organizationMemberships.role,
      createdAt: schema.organizationMemberships.createdAt,
    });

  return {
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
        const result = await inviteLocalMember({
          organizationId,
          email: payload.email,
          role: payload.role,
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
      const [existingMember] = await db
        .select({ id: schema.users.id })
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

      if (existingMember) {
        return memberAlreadyExistsResponse(c);
      }

      await workos.userManagement.sendInvitation({
        email: normalizedEmail,
        organizationId: workosOrganizationId,
        inviterUserId: c.var.auth.user.workosUserId,
        roleSlug: payload.role,
      });

      return c.json(
        {
          member: {
            workosUserId: "",
            email: normalizedEmail,
            firstName: null,
            lastName: null,
            displayName: normalizedEmail,
            role: payload.role,
            isCurrentUser: false,
            createdAt: new Date().toISOString(),
            status: "invited" as const,
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

      if (member.role === "owner" && payload.role !== "owner") {
        const ownerCount = await countOrganizationOwners(organizationId);
        if (ownerCount <= 1) {
          return lastOwnerProtectedResponse(c);
        }
      }

      const workosOrganizationId = c.var.auth.organization.workosOrganizationId;
      const workos = getWorkosServerClient();

      if (
        member.workosMembershipId &&
        workos &&
        !isLocallyManagedWorkosOrganization(workosOrganizationId)
      ) {
        await workos.userManagement.updateOrganizationMembership(member.workosMembershipId, {
          roleSlug: payload.role,
        });
      }

      const [updated] = await db
        .update(schema.organizationMemberships)
        .set({ role: payload.role })
        .where(eq(schema.organizationMemberships.id, member.membershipId))
        .returning({
          role: schema.organizationMemberships.role,
          createdAt: schema.organizationMemberships.createdAt,
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

      if (member.role === "owner") {
        const ownerCount = await countOrganizationOwners(organizationId);
        if (ownerCount <= 1) {
          return lastOwnerProtectedResponse(c);
        }
      }

      const workosOrganizationId = c.var.auth.organization.workosOrganizationId;
      const workos = getWorkosServerClient();

      if (
        member.workosMembershipId &&
        workos &&
        !isLocallyManagedWorkosOrganization(workosOrganizationId)
      ) {
        await workos.userManagement.deleteOrganizationMembership(member.workosMembershipId);
      }

      await removeWorkosMembership(db, {
        workosMembershipId: member.workosMembershipId ?? undefined,
        workosOrganizationId,
        workosUserId: member.workosUserId,
      });

      await deleteMemberMcpSessions(organizationId, member.localUserId);

      return c.body(null, 204);
    });
}
