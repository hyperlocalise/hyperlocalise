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

import { issueSheetFeedQuerySchema } from "./issue-sheet.schema";

const VALID_FEED_CURSOR = "2026-08-08T12:00:00.000Z|0|550e8400-e29b-41d4-a716-446655440000";

describe("issueSheetFeedQuerySchema", () => {
  it("accepts a well-formed feed cursor", () => {
    const result = issueSheetFeedQuerySchema.safeParse({
      limit: "25",
      cursor: VALID_FEED_CURSOR,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        limit: 25,
        cursor: VALID_FEED_CURSOR,
      });
    }
  });

  it("defaults limit when omitted", () => {
    const result = issueSheetFeedQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(100);
      expect(result.data.cursor).toBeUndefined();
    }
  });

  it("rejects cursors with the wrong number of parts", () => {
    const result = issueSheetFeedQuerySchema.safeParse({
      cursor: "2026-08-08T12:00:00.000Z|0",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("cursor"))).toBe(true);
      expect(result.error.issues[0]?.message).toBe(
        "feed cursor must be isoTimestamp|sortRank|uuid",
      );
    }
  });

  it("rejects cursors with an invalid timestamp", () => {
    const result = issueSheetFeedQuerySchema.safeParse({
      cursor: "not-a-date|0|550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("feed cursor timestamp is invalid");
    }
  });

  it("rejects cursors with a sortRank other than 0 or 1", () => {
    const result = issueSheetFeedQuerySchema.safeParse({
      cursor: "2026-08-08T12:00:00.000Z|2|550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("feed cursor sortRank must be 0 or 1");
    }
  });

  it("rejects cursors with a non-RFC UUID even when hex-shaped", () => {
    // Service-side FEED_CURSOR_UUID_PATTERN is hex-only; schema uses z.uuid() and is stricter.
    const result = issueSheetFeedQuerySchema.safeParse({
      cursor: "2026-08-08T12:00:00.000Z|0|550e8400-e29b-01d4-a716-446655440000",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("feed cursor id is invalid");
    }
  });
});
