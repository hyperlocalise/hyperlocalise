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
import { and, eq, or, sql } from "drizzle-orm";

import { isVendorRole } from "@/api/auth/vendor-access";
import { db, schema } from "@/lib/database/client";

/**
 * A condition for queries that look a member up as an actor without the web session: plugin
 * tokens, the Slack and email assistants. A vendor is refused everywhere the session function
 * refuses them (`api/auth/vendor-access.ts`), and these never pass through it.
 *
 * Compared as text, so the query also runs on a database whose role enum has no `vendor` yet.
 */
export const membershipIsNotVendor = sql`${schema.organizationMemberships.role}::text <> 'vendor'`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether the person, named by their user id or their WorkOS user id, is a vendor there. */
export async function isVendorMember(input: {
  organizationId: string;
  userIdOrWorkosUserId: string;
}): Promise<boolean> {
  const [membership] = await db
    .select({ role: schema.organizationMemberships.role })
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.organizationMemberships.userId))
    .where(
      and(
        eq(schema.organizationMemberships.organizationId, input.organizationId),
        UUID_PATTERN.test(input.userIdOrWorkosUserId)
          ? or(
              eq(schema.users.id, input.userIdOrWorkosUserId),
              eq(schema.users.workosUserId, input.userIdOrWorkosUserId),
            )
          : eq(schema.users.workosUserId, input.userIdOrWorkosUserId),
      ),
    )
    .limit(1);
  return isVendorRole(membership?.role);
}
