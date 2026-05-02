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
      })
      .from(schema.connectors)
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
    if (config.inboundEmailAlias === alias) {
      return {
        id: connector.organizationId,
        inboundEmailAddress: asInboundEmailAddress(alias),
      };
    }
  }

  return null;
}
