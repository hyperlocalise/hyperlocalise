import { createHmac, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import {
  removeWorkosMembership,
  syncWorkosIdentity,
  syncWorkosOrganization,
  syncWorkosUser,
} from "@/api/auth/workos-sync";
import { env } from "@/lib/env";
import * as schema from "@/lib/database/schema";
import type { OrganizationMembershipRole } from "@/lib/database/types";

const webhookEventSchema = z.object({
  event: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});

type WorkosWebhookEvent = z.infer<typeof webhookEventSchema>;

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
  if (Math.abs(Date.now() - eventTime) > 5 * 60 * 1000) {
    return false;
  }

  const signedPayload = `${parsed.timestamp}.${input.body}`;

  const expectedSignature = createHmac("sha256", input.secret).update(signedPayload).digest("hex");

  const providedBuffer = Buffer.from(parsed.signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
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

function toMembershipRole(data: Record<string, unknown>): OrganizationMembershipRole {
  const roleField = data["role"];
  const slug =
    typeof roleField === "string"
      ? roleField
      : typeof roleField === "object" && roleField !== null && "slug" in roleField
        ? String((roleField as { slug: unknown }).slug)
        : undefined;
  if (slug === "owner" || slug === "admin") return slug as OrganizationMembershipRole;
  return "member";
}

async function handleWorkosEvent(event: WorkosWebhookEvent): Promise<void> {
  const { db } = await import("@/lib/database");
  const data = event.data;

  if (event.event === "user.created" || event.event === "user.updated") {
    const workosUserId = readString(data, "id", "user_id");
    const email = readString(data, "email");

    if (!workosUserId || !email) {
      return;
    }

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
    await removeWorkosMembership(db, {
      workosMembershipId: readString(data, "id", "membership_id"),
      workosOrganizationId: readString(data, "organization_id"),
      workosUserId: readString(data, "user_id"),
    });

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

    const [existingUser] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.workosUserId, workosUserId))
      .limit(1);

    if (!existingUser) {
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
        role: toMembershipRole(data),
      },
    });
  }
}

export const workosWebhookRoutes = new Hono().post("/", async (c) => {
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

  const parseResult = webhookEventSchema.safeParse(parsedJson);

  if (!parseResult.success) {
    return c.json({ error: "invalid_payload" }, 400);
  }

  await handleWorkosEvent(parseResult.data);

  return c.json({ ok: true }, 200);
});
