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
    const [organization] = await db
      .select({
        id: schema.organizations.id,
        inboundEmailAlias: schema.organizations.inboundEmailAlias,
      })
      .from(schema.organizations)
      .innerJoin(
        schema.organizationMemberships,
        eq(schema.organizationMemberships.organizationId, schema.organizations.id),
      )
      .where(
        and(
          eq(schema.organizations.inboundEmailAlias, alias),
          eq(schema.organizations.emailAgentEnabled, true),
          eq(schema.organizationMemberships.userId, input.senderUserId),
        ),
      )
      .limit(1);

    if (organization?.inboundEmailAlias) {
      return {
        id: organization.id,
        inboundEmailAddress: asInboundEmailAddress(organization.inboundEmailAlias),
      };
    }
  }

  return null;
}
