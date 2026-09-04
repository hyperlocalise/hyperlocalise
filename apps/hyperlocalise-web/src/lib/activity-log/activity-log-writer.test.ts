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
import { asc, eq, inArray, sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { isErr, isOk } from "@/lib/primitives/result/results";
import type { ActivityLogEventInput } from "./activity-log-contract";

import { writeActivityLogEvent } from "./activity-log-writer";

const organizationIds: string[] = [];

async function seedOrganization() {
  const organizationId = crypto.randomUUID();
  organizationIds.push(organizationId);

  await db.insert(schema.organizations).values({
    id: organizationId,
    name: "Activity Log Test Org",
    slug: `activity-log-${organizationId.slice(0, 8)}`,
    workosOrganizationId: `org_${organizationId}`,
  });

  return organizationId;
}

function projectCreatedEvent(
  organizationId: string,
  projectId = crypto.randomUUID(),
): ActivityLogEventInput {
  return {
    actorCredentialId: null,
    actorKind: "user",
    actorUserId: null,
    eventType: "project_created",
    organizationId,
    payload: {
      name: "Website",
      providerKind: "native",
      resourceId: projectId,
    },
    targetId: projectId,
    targetKind: "project",
  };
}

describe("writeActivityLogEvent", () => {
  afterEach(async () => {
    for (const organizationId of organizationIds.splice(0)) {
      await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    }
  });

  it("inserts and returns a persisted event with a database timestamp", async () => {
    const organizationId = await seedOrganization();

    const result = await writeActivityLogEvent(projectCreatedEvent(organizationId));

    expect(isOk(result)).toBe(true);
    if (isErr(result)) return;

    expect(result.value.id).toBeTruthy();
    expect(result.value.createdAt).toBeInstanceOf(Date);

    const [stored] = await db
      .select()
      .from(schema.organizationActivityEvents)
      .where(eq(schema.organizationActivityEvents.id, result.value.id));

    expect(stored).toMatchObject({
      actorKind: "user",
      eventType: "project_created",
      organizationId,
      targetKind: "project",
      targetId: result.value.targetId,
    });
    expect(stored?.payload).toEqual(result.value.payload);
  });

  it("does not expose events from another organization", async () => {
    const firstOrganizationId = await seedOrganization();
    const secondOrganizationId = await seedOrganization();
    const first = await writeActivityLogEvent(projectCreatedEvent(firstOrganizationId));
    const second = await writeActivityLogEvent(projectCreatedEvent(secondOrganizationId));

    expect(isOk(first)).toBe(true);
    expect(isOk(second)).toBe(true);
    if (isErr(first) || isErr(second)) return;

    const firstOrganizationEvents = await db
      .select({ id: schema.organizationActivityEvents.id })
      .from(schema.organizationActivityEvents)
      .where(eq(schema.organizationActivityEvents.organizationId, firstOrganizationId));

    expect(firstOrganizationEvents).toEqual([{ id: first.value.id }]);
    expect(firstOrganizationEvents).not.toContainEqual({ id: second.value.id });
  });

  it("keeps sequential writes ordered by clock_timestamp inside a transaction", async () => {
    const organizationId = await seedOrganization();

    const eventIds = await db.transaction(async (transaction) => {
      const first = await writeActivityLogEvent(projectCreatedEvent(organizationId), {
        database: transaction,
      });
      await transaction.execute(sql`select pg_sleep(0.001)`);
      const second = await writeActivityLogEvent(projectCreatedEvent(organizationId), {
        database: transaction,
      });

      expect(isOk(first)).toBe(true);
      expect(isOk(second)).toBe(true);
      if (isErr(first) || isErr(second)) return [];
      return [first.value.id, second.value.id];
    });

    const orderedEvents = await db
      .select({ id: schema.organizationActivityEvents.id })
      .from(schema.organizationActivityEvents)
      .where(inArray(schema.organizationActivityEvents.id, eventIds))
      .orderBy(
        asc(schema.organizationActivityEvents.createdAt),
        asc(schema.organizationActivityEvents.id),
      );

    expect(orderedEvents.map((event) => event.id)).toEqual(eventIds);
  });

  it("rejects unsafe payloads before inserting", async () => {
    const organizationId = await seedOrganization();
    const error = vi.fn();
    const input = {
      ...projectCreatedEvent(organizationId),
      payload: {
        secret: "must-not-persist",
      } as unknown as ActivityLogEventInput["payload"],
    } as unknown as ActivityLogEventInput;

    const result = await writeActivityLogEvent(input, {
      correlationId: "activity-log-test-validation",
      logger: { error },
    });

    expect(isErr(result)).toBe(true);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: "activity-log-test-validation",
        failure: "payload_validation",
      }),
      "workspace activity log write failed",
    );

    const stored = await db
      .select()
      .from(schema.organizationActivityEvents)
      .where(eq(schema.organizationActivityEvents.organizationId, organizationId));

    expect(stored).toEqual([]);
    expect(JSON.stringify(error.mock.calls)).not.toContain("must-not-persist");
  });

  it("returns a safe typed failure when the database insert fails", async () => {
    const organizationId = await seedOrganization();
    const error = vi.fn();
    const database = {
      transaction: vi.fn().mockRejectedValue(new Error("database failure")),
    } as unknown as DatabaseClient;

    const result = await writeActivityLogEvent(projectCreatedEvent(organizationId), {
      correlationId: "activity-log-test-database",
      database,
      logger: { error },
    });

    expect(result).toEqual({ ok: false, error: { code: "activity_log_write_failed" } });
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: "activity-log-test-database",
        failure: "database_insert",
      }),
      "workspace activity log write failed",
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("database failure");
  });

  it("rolls back the event when the owning transaction rolls back", async () => {
    const organizationId = await seedOrganization();
    const projectId = crypto.randomUUID();

    await expect(
      db.transaction(async (transaction) => {
        const result = await writeActivityLogEvent(projectCreatedEvent(organizationId, projectId), {
          database: transaction,
        });

        expect(isOk(result)).toBe(true);
        throw new Error("rollback owning mutation");
      }),
    ).rejects.toThrow("rollback owning mutation");

    const stored = await db
      .select()
      .from(schema.organizationActivityEvents)
      .where(eq(schema.organizationActivityEvents.targetId, projectId));

    expect(stored).toEqual([]);
  });
});
