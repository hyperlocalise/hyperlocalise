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
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";
import { err, ok, type Result } from "@/lib/primitives/result/results";

export const MEMORY_ENTRY_LIST_SORTS = ["created_at", "updated_at"] as const;
export const MEMORY_ENTRY_LIST_SORT_DIRS = ["asc", "desc"] as const;

export type MemoryEntryListSort = (typeof MEMORY_ENTRY_LIST_SORTS)[number];
export type MemoryEntryListSortDir = (typeof MEMORY_ENTRY_LIST_SORT_DIRS)[number];

export const MEMORY_ENTRY_CURSOR_TTL_MS = 24 * 60 * 60 * 1000;
export const MEMORY_ENTRY_CURSOR_VERSION = 1;

export type MemoryEntryListFilterFields = {
  search?: string;
  sourceLocale?: string;
  targetLocale?: string;
  reviewStatus?: string;
  origin?: string;
  provider?: string;
  createdByUserId?: string;
  modifiedFrom?: string;
  modifiedTo?: string;
  importBatchId?: string;
  sort: MemoryEntryListSort;
  sortDir: MemoryEntryListSortDir;
};

export type MemoryEntryCursorPayload = {
  v: typeof MEMORY_ENTRY_CURSOR_VERSION;
  sort: MemoryEntryListSort;
  dir: MemoryEntryListSortDir;
  sortValue: string;
  id: string;
  issuedAt: string;
  filterHash: string;
};

export type MemoryEntryCursorError = {
  code: "invalid_cursor";
  reason: "malformed" | "tampered" | "expired" | "filter_mismatch";
  message: string;
};

const ENTRY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cursorSecret(): string {
  return (
    env.WORKOS_COOKIE_PASSWORD ??
    env.PROVIDER_CREDENTIALS_MASTER_KEY ??
    "tm-entry-cursor-dev-secret-min-32-chars"
  );
}

function signCursorPayload(encodedPayload: string): string {
  return createHmac("sha256", `${cursorSecret()}:tm-entry-cursor:v1`)
    .update(encodedPayload)
    .digest("base64url");
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashMemoryEntryListFilters(filters: MemoryEntryListFilterFields): string {
  const canonical = JSON.stringify({
    createdByUserId: filters.createdByUserId ?? "",
    importBatchId: filters.importBatchId ?? "",
    modifiedFrom: filters.modifiedFrom ?? "",
    modifiedTo: filters.modifiedTo ?? "",
    origin: filters.origin ?? "",
    provider: filters.provider ?? "",
    reviewStatus: filters.reviewStatus ?? "",
    search: filters.search ?? "",
    sort: filters.sort,
    sortDir: filters.sortDir,
    sourceLocale: filters.sourceLocale ?? "",
    targetLocale: filters.targetLocale ?? "",
  });

  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export function encodeMemoryEntryCursor(input: {
  filters: MemoryEntryListFilterFields;
  id: string;
  sortValue: string;
  issuedAt?: Date;
}): string {
  const payload: MemoryEntryCursorPayload = {
    v: MEMORY_ENTRY_CURSOR_VERSION,
    sort: input.filters.sort,
    dir: input.filters.sortDir,
    sortValue: input.sortValue,
    id: input.id,
    issuedAt: (input.issuedAt ?? new Date()).toISOString(),
    filterHash: hashMemoryEntryListFilters(input.filters),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signCursorPayload(encodedPayload)}`;
}

export function decodeMemoryEntryCursor(
  cursor: string,
  filters: MemoryEntryListFilterFields,
  now = new Date(),
): Result<MemoryEntryCursorPayload, MemoryEntryCursorError> {
  const parts = cursor.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return err({
      code: "invalid_cursor",
      reason: "malformed",
      message: "Cursor is invalid",
    });
  }

  const [encodedPayload, signature] = parts;
  if (!signaturesMatch(signature, signCursorPayload(encodedPayload))) {
    return err({
      code: "invalid_cursor",
      reason: "tampered",
      message: "Cursor is invalid",
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return err({
      code: "invalid_cursor",
      reason: "malformed",
      message: "Cursor is invalid",
    });
  }

  if (!isMemoryEntryCursorPayload(payload)) {
    return err({
      code: "invalid_cursor",
      reason: "malformed",
      message: "Cursor is invalid",
    });
  }

  const issuedAtMs = Date.parse(payload.issuedAt);
  if (Number.isNaN(issuedAtMs) || now.getTime() - issuedAtMs > MEMORY_ENTRY_CURSOR_TTL_MS) {
    return err({
      code: "invalid_cursor",
      reason: "expired",
      message: "Cursor is invalid",
    });
  }

  if (payload.filterHash !== hashMemoryEntryListFilters(filters)) {
    return err({
      code: "invalid_cursor",
      reason: "filter_mismatch",
      message: "Cursor is invalid",
    });
  }

  return ok(payload);
}

function isMemoryEntryCursorPayload(value: unknown): value is MemoryEntryCursorPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<MemoryEntryCursorPayload>;
  return (
    payload.v === MEMORY_ENTRY_CURSOR_VERSION &&
    (MEMORY_ENTRY_LIST_SORTS as readonly string[]).includes(payload.sort ?? "") &&
    (MEMORY_ENTRY_LIST_SORT_DIRS as readonly string[]).includes(payload.dir ?? "") &&
    typeof payload.sortValue === "string" &&
    !Number.isNaN(Date.parse(payload.sortValue)) &&
    typeof payload.id === "string" &&
    ENTRY_ID_PATTERN.test(payload.id) &&
    typeof payload.issuedAt === "string" &&
    typeof payload.filterHash === "string" &&
    payload.filterHash.length === 16
  );
}
