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
import { Column, eq, getTableName, is, or, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";

/**
 * Whether the person is in a vendor team of the workspace (`api/auth/vendor-access.ts`). Both
 * arguments are columns or values of the outer query. Aliased inside, so the outer query may join
 * the same tables.
 */
export function vendorTeamMemberSql(userId: AnyColumn | SQL, organizationId: AnyColumn | SQL) {
  return sql<boolean>`exists (
    select 1 from team_memberships vtm join teams vt on vt.id = vtm.team_id
    where vtm.user_id = ${outer(userId)} and vt.organization_id = ${outer(organizationId)}
      and vt.is_vendor
  )`;
}

/**
 * A column of the outer query, always with its table's name. Drizzle leaves the name out in a
 * query on one table, and inside the subquery an unqualified `user_id` would be its own.
 */
function outer(value: AnyColumn | SQL) {
  return is(value, Column)
    ? sql`${sql.identifier(getTableName(value.table))}.${sql.identifier(value.name)}`
    : value;
}

/**
 * A condition for queries that look a member up as an actor without the web session: plugin
 * tokens, the Slack and email assistants. A vendor is refused everywhere the session function
 * refuses them, and these never pass through it.
 */
export const membershipIsNotVendor = sql`not ${vendorTeamMemberSql(
  schema.organizationMemberships.userId,
  schema.organizationMemberships.organizationId,
)}`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether the person, named by their user id or their WorkOS user id, is a vendor there. */
export async function isVendorMember(input: {
  organizationId: string;
  userIdOrWorkosUserId: string;
}): Promise<boolean> {
  const [person] = await db
    .select({ inVendorTeam: vendorTeamMemberSql(schema.users.id, sql`${input.organizationId}`) })
    .from(schema.users)
    .where(
      UUID_PATTERN.test(input.userIdOrWorkosUserId)
        ? or(
            eq(schema.users.id, input.userIdOrWorkosUserId),
            eq(schema.users.workosUserId, input.userIdOrWorkosUserId),
          )
        : eq(schema.users.workosUserId, input.userIdOrWorkosUserId),
    )
    .limit(1);
  return person?.inVendorTeam === true;
}
