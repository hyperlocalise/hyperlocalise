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
import { describe, expect, it } from "vite-plus/test";

import { activityLogQuerySchema } from "./activity-log.schema";

describe("activityLogQuerySchema", () => {
  it("defaults to all event types and all-time activity", () => {
    expect(activityLogQuerySchema.parse({})).toEqual({
      eventTypes: [],
      limit: 50,
      range: "all",
    });
  });

  it("accepts actor, range, event type, and bounded limit filters", () => {
    expect(
      activityLogQuerySchema.parse({
        actor: "user:123e4567-e89b-12d3-a456-426614174000",
        eventTypes: ["project_created"],
        limit: "25",
        range: "7d",
      }),
    ).toEqual({
      actor: "user:123e4567-e89b-12d3-a456-426614174000",
      eventTypes: ["project_created"],
      limit: 25,
      range: "7d",
    });
  });

  it("rejects malformed user actors and unsupported ranges", () => {
    expect(activityLogQuerySchema.safeParse({ actor: "user:" }).success).toBe(false);
    expect(activityLogQuerySchema.safeParse({ actor: "user:user-123" }).success).toBe(false);
    expect(activityLogQuerySchema.safeParse({ range: "90d" }).success).toBe(false);
  });
});
