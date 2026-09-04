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

import { InvalidActivityLogCursorError, listActivityLogEvents } from "./activity-log-reader";

describe("listActivityLogEvents", () => {
  it("rejects cursors with non-UUID event IDs before querying the database", async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        createdAt: "2026-09-04T10:00:00.000Z",
        filterFingerprint: "unused",
        id: "not-a-uuid",
      }),
    ).toString("base64url");

    await expect(
      listActivityLogEvents({
        database: {} as never,
        organizationId: "organization-id",
        organizationSlug: "organization",
        query: { cursor, eventTypes: [], limit: 50, range: "all" },
      }),
    ).rejects.toBeInstanceOf(InvalidActivityLogCursorError);
  });
});
