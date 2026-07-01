import { createHmac, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import type { OrganizationMembershipRole } from "@/lib/database/types";
import { resolveWorkosMembershipRoleForSync } from "@/api/auth/workos-membership-reconcile";
import {
  promoteInvitedPlaceholderUser,
  removePendingOrganizationMembershipForInvite,
  revokeOrganizationMembershipAccess,
  syncWorkosIdentity,
  syncWorkosOrganization,
  syncWorkosUser,
} from "@/api/auth/workos-sync";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/log";
import * as schema from "@/lib/database/schema";
import { getWorkosServerClient } from "@/lib/workos/server-client";
import { type WorkosWebhookEvent, workosWebhookEventSchema } from "./workos-webhook.schema";

const logger = createLogger("workos-webhook");

type ParsedSignature = {
  timestamp: string;
  signature: string;
};

function parseWorkosSignatureHeader(header: string | null | undefined): ParsedSignature | null {
  if (!header) {
    return null;
  }

  const parts = header.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signature = parts.find((part) => part.startsWith("v1="))?.slice(3);

  if (!timestamp || !signature) {
    return null;
  }

  return {
    timestamp,
    signature,
  };
}

function verifyWorkosWebhookSignature(input: {
  body: string;
  signatureHeader: string | null | undefined;
  secret: string;
}): boolean {
  const parsed = parseWorkosSignatureHeader(input.signatureHeader);

  if (!parsed) {
    return false;
  }

  const eventTime = Number(parsed.timestamp) * 1000;
  if (isNaN(eventTime) || Math.abs(Date.now() - eventTime) > 5 * 60 * 1000) {
    return false;
  }

  const signedPayload = `${parsed.timestamp}.${input.body}`;

  const expectedSignature = createHmac("sha256", input.secret).update(signedPayload).digest("hex");

  if (parsed.signature.length !== expectedSignature.length) {
    return false;
  }

  const providedBuffer = Buffer.from(parsed.signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  try {
    return timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

function readString(data: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key];

    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

async function isAuthoritativeWorkosMembershipActive(workosMembershipId: string) {
  const workos = getWorkosServerClient();
  if (!workos) {
    return true;
  }

  try {
    const membership = await workos.userManagement.getOrganizationMembership(workosMembershipId);
    return membership.status === "active";
  } catch {
    return false;
  }
}

async function handleWorkosEvent(event: WorkosWebhookEvent): Promise<void> {
  const { db } = await import("@/lib/database");
  const data = event.data;

  if (event.event === "invitation.revoked") {
    const workosOrganizationId = readString(data, "organization_id");
    const email = readString(data, "email");

    if (!workosOrganizationId || !email) {
      logger.warn("invitation.revoked missing required fields", {
        event: event.event,
        missingFields: [
          !workosOrganizationId ? "organization_id" : null,
          !email ? "email" : null,
        ].filter(Boolean),
      });
      return;
    }

    await removePendingOrganizationMembershipForInvite(db, {
      workosOrganizationId,
      email,
    });

    return;
  }

  if (event.event === "user.created" || event.event === "user.updated") {
    const workosUserId = readString(data, "id", "user_id");
    const email = readString(data, "email");

    if (!workosUserId || !email) {
      return;
    }

    await promoteInvitedPlaceholderUser(db, { email, workosUserId });

    await syncWorkosUser(db, {
      workosUserId,
      email,
      firstName: readString(data, "first_name", "firstName"),
      lastName: readString(data, "last_name", "lastName"),
      avatarUrl: readString(data, "profile_picture_url", "avatar", "avatar_url"),
    });

    return;
  }

  if (event.event === "organization.created" || event.event === "organization.updated") {
    const workosOrganizationId = readString(data, "id", "organization_id");
    const name = readString(data, "name");

    if (!workosOrganizationId || !name) {
      return;
    }

    await syncWorkosOrganization(db, {
      workosOrganizationId,
      name,
      slug: readString(data, "slug"),
    });

    return;
  }

  if (event.event === "organization_membership.deleted") {
    const workosOrganizationId = readString(data, "organization_id");
    const workosUserId = readString(data, "user_id");

    await db.transaction((tx) =>
      revokeOrganizationMembershipAccess(tx, {
        workosMembershipId: readString(data, "id", "membership_id"),
        workosOrganizationId,
        workosUserId,
      }),
    );

    return;
  }

  if (
    event.event === "organization_membership.created" ||
    event.event === "organization_membership.updated"
  ) {
    const { db } = await import("@/lib/database");
    const workosMembershipId = readString(data, "id", "membership_id");
    const workosOrganizationId = readString(data, "organization_id");
    const workosUserId = readString(data, "user_id");

    if (!workosOrganizationId || !workosUserId) {
      return;
    }

    const membershipEmail = readString(data, "email", "user_email");
    let [existingUser] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.workosUserId, workosUserId))
      .limit(1);

    if (!existingUser && membershipEmail) {
      const promoted = await promoteInvitedPlaceholderUser(db, {
        email: membershipEmail,
        workosUserId,
      });

      if (promoted) {
        [existingUser] = await db
          .select({ email: schema.users.email })
          .from(schema.users)
          .where(eq(schema.users.workosUserId, workosUserId))
          .limit(1);
      }
    }

    if (!existingUser) {
      return;
    }

    if (!workosMembershipId) {
      return;
    }

    if (!(await isAuthoritativeWorkosMembershipActive(workosMembershipId))) {
      return;
    }

    const [existingOrg] = await db
      .select({ name: schema.organizations.name, slug: schema.organizations.slug })
      .from(schema.organizations)
      .where(eq(schema.organizations.workosOrganizationId, workosOrganizationId))
      .limit(1);

    if (!existingOrg) {
      return;
    }

    let role: OrganizationMembershipRole;
    try {
      role = await resolveWorkosMembershipRoleForSync(db, {
        workosUserId,
        email: existingUser.email,
        workosOrganizationId,
        remoteRoleField: data["role"],
      });
    } catch (error) {
      if (error instanceof Error && error.message === "workos_membership_unknown_role_slug") {
        logger.warn("workos_membership_unknown_role_slug", {
          workosUserId,
          workosMembershipId,
          workosOrganizationId,
        });
        return;
      }

      throw error;
    }

    await syncWorkosIdentity(db, {
      user: {
        workosUserId,
        email: existingUser.email,
        firstName: readString(data, "first_name", "firstName", "user_first_name"),
        lastName: readString(data, "last_name", "lastName", "user_last_name"),
        avatarUrl: readString(data, "profile_picture_url", "avatar", "avatar_url"),
      },
      organization: {
        workosOrganizationId,
        name: existingOrg.name,
        slug: existingOrg.slug ?? undefined,
      },
      membership: {
        workosMembershipId,
        role,
      },
    });
  }
}

const maxWorkosWebhookBytes = 256 * 1024;

export const workosWebhookRoutes = new Hono().post(
  "/",
  bodyLimit({
    maxSize: maxWorkosWebhookBytes,
    onError: (c) => c.json({ error: "payload_too_large" }, 413),
  }),
  async (c) => {
    if (!env.WORKOS_WEBHOOK_SECRET) {
      return c.json({ error: "workos_not_configured" }, 503);
    }

    const body = await c.req.text();

    const isValid = verifyWorkosWebhookSignature({
      body,
      signatureHeader: c.req.header("workos-signature"),
      secret: env.WORKOS_WEBHOOK_SECRET,
    });

    if (!isValid) {
      return c.json({ error: "invalid_signature" }, 401);
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(body);
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const parseResult = workosWebhookEventSchema.safeParse(parsedJson);

    if (!parseResult.success) {
      return c.json({ error: "invalid_payload" }, 400);
    }

    await handleWorkosEvent(parseResult.data);

    return c.json({ ok: true }, 200);
  },
);
