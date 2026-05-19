import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

const inboundEmailDomain = "inbox.hyperlocalise.com";

function parseEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function inboundAliasFromAddress(value: string) {
  const address = parseEmailAddress(value);
  const [localPart, domain] = address.split("@");

  if (!localPart || domain !== inboundEmailDomain) {
    return null;
  }

  return localPart;
}

export function asInboundEmailAddress(alias: string) {
  return `${alias}@${inboundEmailDomain}`;
}

function isWeakInboundAlias(alias: string) {
  return /-[0-9a-f]{6}$/i.test(alias);
}

function normalizeSlug(value: string | null | undefined) {
  const normalized = (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);

  return normalized || "org";
}

function generateInboundAlias(slug: string | null | undefined) {
  return `${normalizeSlug(slug)}-${randomBytes(16).toString("hex")}`;
}

async function rotateWeakInboundAlias(input: {
  organizationId: string;
  organizationSlug: string | null;
}) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const inboundEmailAlias = generateInboundAlias(input.organizationSlug);
    try {
      const [connector] = await db
        .update(schema.connectors)
        .set({
          config: { inboundEmailAlias },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.connectors.organizationId, input.organizationId),
            eq(schema.connectors.kind, "email"),
          ),
        )
        .returning({ config: schema.connectors.config });

      if (connector) {
        return (connector.config as { inboundEmailAlias?: string }).inboundEmailAlias ?? null;
      }
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("email_alias_generation_conflict");
}

export async function resolveInboundEmailOrganization(input: {
  senderUserId: string;
  recipientAddresses: string[];
}) {
  const aliases = input.recipientAddresses
    .map(inboundAliasFromAddress)
    .filter((alias): alias is string => Boolean(alias));

  for (const alias of aliases) {
    const [connector] = await db
      .select({
        organizationId: schema.connectors.organizationId,
        config: schema.connectors.config,
        organizationSlug: schema.organizations.slug,
      })
      .from(schema.connectors)
      .innerJoin(
        schema.organizations,
        eq(schema.organizations.id, schema.connectors.organizationId),
      )
      .innerJoin(
        schema.organizationMemberships,
        eq(schema.organizationMemberships.organizationId, schema.connectors.organizationId),
      )
      .where(
        and(
          eq(schema.connectors.kind, "email"),
          eq(schema.connectors.enabled, true),
          eq(schema.organizationMemberships.userId, input.senderUserId),
        ),
      )
      .limit(1);

    if (!connector) {
      continue;
    }

    const config = connector.config as { inboundEmailAlias?: string };
    if (config.inboundEmailAlias !== alias) {
      continue;
    }

    const inboundEmailAlias = isWeakInboundAlias(alias)
      ? await rotateWeakInboundAlias({
          organizationId: connector.organizationId,
          organizationSlug: connector.organizationSlug,
        })
      : alias;
    if (inboundEmailAlias) {
      return {
        id: connector.organizationId,
        inboundEmailAddress: asInboundEmailAddress(inboundEmailAlias),
      };
    }
  }

  return null;
}
