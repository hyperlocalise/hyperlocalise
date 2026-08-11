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

const PATH_TIMESTAMP_PAD_WIDTH = 20;

/**
 * Build a path segment that sorts lexicographically in creation order.
 *
 * Materialized paths paginate and nest by string order. Random UUID segments
 * scramble sibling order; a zero-padded microsecond-epoch prefix keeps
 * chronological sibling order while the UUID preserves uniqueness.
 *
 * Accepts either a Date (millisecond precision) or a microsecond-epoch string
 * from PostgreSQL `extract(epoch from created_at) * 1000000`.
 */
export function commentPathSegment(createdAt: Date | string | number, id: string): string {
  let micros: bigint;
  if (createdAt instanceof Date) {
    const timestampMs = createdAt.getTime();
    if (!Number.isFinite(timestampMs)) {
      throw new Error("invalid_comment_created_at");
    }
    micros = BigInt(timestampMs) * BigInt(1000);
  } else if (typeof createdAt === "number") {
    if (!Number.isFinite(createdAt)) {
      throw new Error("invalid_comment_created_at");
    }
    micros = BigInt(Math.trunc(createdAt));
  } else {
    const trimmed = createdAt.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error("invalid_comment_created_at");
    }
    micros = BigInt(trimmed);
  }

  return `${micros.toString().padStart(PATH_TIMESTAMP_PAD_WIDTH, "0")}_${id}`;
}

export function commentPathFromParent(parentPath: string | null, segment: string): string {
  return parentPath ? `${parentPath}.${segment}` : segment;
}
