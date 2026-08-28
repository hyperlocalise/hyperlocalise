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
import "dotenv/config";

import { randomUUID } from "node:crypto";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

import { createApp } from "@/api/app";
import { db } from "@/lib/database/client";

import { isOk } from "@/lib/primitives/result/results";

import { decodeMemoryEntryCursor, encodeMemoryEntryCursor } from "./memory-entry-cursor";
import { createMemoryTestFixture } from "./memory.fixture";

const client = testClient(createApp());
const fixture = createMemoryTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

type EntryListBody = {
  memoryEntries: Array<{
    id: string;
    sourceText: string;
    targetText: string;
    sourceLocale: string;
    targetLocale: string;
    provenance: string;
    reviewStatus: string;
    externalKey: string | null;
    createdByUserId: string | null;
    importBatchId: string | null;
  }>;
  nextCursor: string | null;
  total: number;
  pagination: { limit: number; returned: number; hasMore: boolean };
};

type EntryListQuery = {
  limit?: string;
  cursor?: string;
  search?: string;
  sourceLocale?: string;
  targetLocale?: string;
  reviewStatus?: "approved" | "pending" | "rejected";
  origin?: string;
  provider?: string;
  createdByUserId?: string;
  modifiedFrom?: string;
  modifiedTo?: string;
  importBatchId?: string;
  sort?: "created_at" | "updated_at";
  sortDir?: "asc" | "desc";
};

type ListEntriesCall =
  (typeof client.api.orgs)[":organizationSlug"]["translation-memories"][":memoryId"]["entries"]["$get"];
type ListEntriesQuery = NonNullable<Parameters<ListEntriesCall>[0]>["query"];

async function stampEntryTimestamps(entryId: string, timestamp: string) {
  await db.$client.query(
    `update memory_entries
     set created_at = $1::timestamptz, updated_at = $1::timestamptz
     where id = $2`,
    [timestamp, entryId],
  );
}

async function listEntries(input: {
  organizationSlug: string;
  memoryId: string;
  headers: { cookie: string };
  query?: EntryListQuery;
}) {
  return client.api.orgs[":organizationSlug"]["translation-memories"][":memoryId"].entries.$get(
    {
      param: {
        organizationSlug: input.organizationSlug,
        memoryId: input.memoryId,
      },
      query: input.query as ListEntriesQuery,
    },
    { headers: input.headers },
  );
}

describe("GET /translation-memories/:memoryId/entries", () => {
  it("pages deterministically with a created_at id tie-breaker", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const createdAt = new Date("2026-08-01T12:00:00.000Z");

    const first = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Alpha",
      targetText: "Alfa",
      createdAt,
    });
    const second = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Bravo",
      targetText: "Bravo",
      createdAt,
    });
    const third = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Charlie",
      targetText: "Charlie",
      createdAt,
    });
    const expectedOrder = [first, second, third].toSorted((left, right) =>
      right.id.localeCompare(left.id),
    );

    const firstPage = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { limit: "2" },
    });
    expect(firstPage.status).toBe(200);
    const firstBody = (await firstPage.json()) as EntryListBody;
    expect(firstBody.memoryEntries.map((entry) => entry.id)).toEqual([
      expectedOrder[0]?.id,
      expectedOrder[1]?.id,
    ]);
    expect(firstBody.pagination).toEqual({ limit: 2, returned: 2, hasMore: true });
    expect(firstBody.total).toBe(3);
    expect(firstBody.nextCursor).toBeTruthy();

    const secondPage = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { limit: "2", cursor: firstBody.nextCursor! },
    });
    expect(secondPage.status).toBe(200);
    const secondBody = (await secondPage.json()) as EntryListBody;
    expect(secondBody.memoryEntries.map((entry) => entry.id)).toEqual([expectedOrder[2]?.id]);
    expect(secondBody.nextCursor).toBeNull();
    expect(secondBody.pagination.hasMore).toBe(false);

    const pagedIds = [...firstBody.memoryEntries, ...secondBody.memoryEntries].map(
      (entry) => entry.id,
    );
    expect(pagedIds).toEqual(expectedOrder.map((entry) => entry.id));
    expect(new Set(pagedIds).size).toBe(3);
  });

  it("pages through rows that share a sub-millisecond timestamp", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const sharedTimestamp = "2026-08-01T12:00:00.123456Z";

    const first = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Alpha",
      targetText: "Alfa",
    });
    const second = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Bravo",
      targetText: "Bravo",
    });
    const third = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Charlie",
      targetText: "Charlie",
    });
    await stampEntryTimestamps(first.id, sharedTimestamp);
    await stampEntryTimestamps(second.id, sharedTimestamp);
    await stampEntryTimestamps(third.id, sharedTimestamp);

    const expectedDesc = [first, second, third].toSorted((left, right) =>
      right.id.localeCompare(left.id),
    );
    const expectedAsc = [first, second, third].toSorted((left, right) =>
      left.id.localeCompare(right.id),
    );

    const firstDesc = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { limit: "2" },
    });
    expect(firstDesc.status).toBe(200);
    const firstDescBody = (await firstDesc.json()) as EntryListBody;
    expect(firstDescBody.memoryEntries.map((entry) => entry.id)).toEqual([
      expectedDesc[0]?.id,
      expectedDesc[1]?.id,
    ]);
    expect(firstDescBody.nextCursor).toBeTruthy();

    const decodedDesc = decodeMemoryEntryCursor(firstDescBody.nextCursor!, {
      sort: "created_at",
      sortDir: "desc",
    });
    expect(isOk(decodedDesc)).toBe(true);
    if (isOk(decodedDesc)) {
      expect(decodedDesc.value.sortValue).toBe(sharedTimestamp);
    }

    const secondDesc = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { limit: "2", cursor: firstDescBody.nextCursor! },
    });
    expect(secondDesc.status).toBe(200);
    const secondDescBody = (await secondDesc.json()) as EntryListBody;
    expect(secondDescBody.memoryEntries.map((entry) => entry.id)).toEqual([expectedDesc[2]?.id]);
    expect(secondDescBody.nextCursor).toBeNull();

    const firstAsc = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { limit: "2", sortDir: "asc" },
    });
    expect(firstAsc.status).toBe(200);
    const firstAscBody = (await firstAsc.json()) as EntryListBody;
    expect(firstAscBody.memoryEntries.map((entry) => entry.id)).toEqual([
      expectedAsc[0]?.id,
      expectedAsc[1]?.id,
    ]);

    const secondAsc = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { limit: "2", sortDir: "asc", cursor: firstAscBody.nextCursor! },
    });
    expect(secondAsc.status).toBe(200);
    const secondAscBody = (await secondAsc.json()) as EntryListBody;
    expect(secondAscBody.memoryEntries.map((entry) => entry.id)).toEqual([expectedAsc[2]?.id]);

    const descIds = [...firstDescBody.memoryEntries, ...secondDescBody.memoryEntries].map(
      (entry) => entry.id,
    );
    const ascIds = [...firstAscBody.memoryEntries, ...secondAscBody.memoryEntries].map(
      (entry) => entry.id,
    );
    expect(descIds).toEqual(expectedDesc.map((entry) => entry.id));
    expect(ascIds).toEqual(expectedAsc.map((entry) => entry.id));
    expect(new Set(descIds).size).toBe(3);
    expect(new Set(ascIds).size).toBe(3);
  });

  it("orders and pages rows that differ only by microseconds", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const earliest = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Earliest",
      targetText: "Primero",
    });
    const middle = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Middle",
      targetText: "Medio",
    });
    const latest = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Latest",
      targetText: "Ultimo",
    });
    await stampEntryTimestamps(earliest.id, "2026-08-01T12:00:00.123000Z");
    await stampEntryTimestamps(middle.id, "2026-08-01T12:00:00.123456Z");
    await stampEntryTimestamps(latest.id, "2026-08-01T12:00:00.123999Z");

    const firstPage = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { limit: "1" },
    });
    const firstBody = (await firstPage.json()) as EntryListBody;
    expect(firstBody.memoryEntries.map((entry) => entry.sourceText)).toEqual(["Latest"]);

    const secondPage = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { limit: "1", cursor: firstBody.nextCursor! },
    });
    const secondBody = (await secondPage.json()) as EntryListBody;
    expect(secondBody.memoryEntries.map((entry) => entry.sourceText)).toEqual(["Middle"]);

    const thirdPage = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { limit: "1", cursor: secondBody.nextCursor! },
    });
    const thirdBody = (await thirdPage.json()) as EntryListBody;
    expect(thirdBody.memoryEntries.map((entry) => entry.sourceText)).toEqual(["Earliest"]);
    expect(thirdBody.nextCursor).toBeNull();
  });

  it("returns an empty page contract when no entries match", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);

    const response = await listEntries({
      organizationSlug: identity.organization.slug ?? "missing-slug",
      memoryId: memory.id,
      headers,
      query: { search: "no-such-entry" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      memoryEntries: [],
      nextCursor: null,
      total: 0,
      pagination: { limit: 50, returned: 0, hasMore: false },
    });
  });

  it("combines search with locale, review, origin, creator, and import batch filters", async () => {
    const { identity, memory, user } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const importBatchId = randomUUID();
    const createdAt = new Date("2026-08-02T08:00:00.000Z");

    await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Save changes",
      targetText: "Guardar cambios",
      sourceLocale: "en",
      targetLocale: "es",
      provenance: "import",
      reviewStatus: "pending",
      createdByUserId: user.id,
      importBatchId,
      metadata: { context: "settings footer", provider: "crowdin" },
      createdAt,
      updatedAt: createdAt,
    });
    await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Save changes",
      targetText: "Enregistrer",
      sourceLocale: "en",
      targetLocale: "fr",
      provenance: "manual",
      reviewStatus: "approved",
      createdAt,
    });
    await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Discard changes",
      targetText: "Descartar cambios",
      sourceLocale: "en",
      targetLocale: "es",
      provenance: "import",
      reviewStatus: "pending",
      createdByUserId: user.id,
      importBatchId,
      createdAt,
    });

    const response = await listEntries({
      organizationSlug: identity.organization.slug ?? "missing-slug",
      memoryId: memory.id,
      headers,
      query: {
        search: "footer",
        sourceLocale: "en",
        targetLocale: "es",
        reviewStatus: "pending",
        origin: "import",
        provider: "crowdin",
        createdByUserId: user.id,
        importBatchId,
        modifiedFrom: "2026-08-02T00:00:00.000Z",
        modifiedTo: "2026-08-03T00:00:00.000Z",
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as EntryListBody;
    expect(body.total).toBe(1);
    expect(body.memoryEntries).toEqual([
      expect.objectContaining({
        sourceText: "Save changes",
        targetText: "Guardar cambios",
        sourceLocale: "en",
        targetLocale: "es",
        provenance: "import",
        reviewStatus: "pending",
        createdByUserId: user.id,
        importBatchId,
      }),
    ]);
  });

  it("finds entries by identifier, source text, and target text", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const entry = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Account settings",
      targetText: "Paramètres du compte",
      sourceLocale: "en",
      targetLocale: "fr",
      externalKey: "settings.account.title",
    });

    const byId = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { search: entry.id },
    });
    expect(byId.status).toBe(200);
    expect(((await byId.json()) as EntryListBody).memoryEntries.map((item) => item.id)).toEqual([
      entry.id,
    ]);

    const byKey = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { search: "settings.account.title" },
    });
    expect(byKey.status).toBe(200);
    expect(((await byKey.json()) as EntryListBody).memoryEntries.map((item) => item.id)).toEqual([
      entry.id,
    ]);

    const byTarget = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { search: "Paramètres" },
    });
    expect(byTarget.status).toBe(200);
    expect(((await byTarget.json()) as EntryListBody).memoryEntries.map((item) => item.id)).toEqual(
      [entry.id],
    );
  });

  it("hides unattached memories from team-scoped members", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const member = fixture.createWorkosIdentityForOrganization(identity.organization, "member");
    const headers = await fixture.authHeadersFor(member);

    const response = await listEntries({
      organizationSlug: identity.organization.slug ?? "missing-slug",
      memoryId: memory.id,
      headers,
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "memory_not_found" });
  });

  it("returns 404 before querying when the caller cannot access the memory", async () => {
    const { memory } = await fixture.createStoredMemoryFixture();
    const other = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(other.identity);

    const response = await listEntries({
      organizationSlug: other.identity.organization.slug ?? "missing-slug",
      memoryId: memory.id,
      headers,
      query: { search: "secret" },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "memory_not_found" });
  });

  it("does not return entries from another organization's memory", async () => {
    const owned = await fixture.createStoredMemoryFixture();
    const foreign = await fixture.createStoredMemoryFixture();
    await fixture.insertMemoryEntry(owned.memory.id, {
      sourceText: "Owned",
      targetText: "Propio",
    });
    await fixture.insertMemoryEntry(foreign.memory.id, {
      sourceText: "Foreign",
      targetText: "Ajeno",
    });
    const headers = await fixture.authHeadersFor(owned.identity);

    const response = await listEntries({
      organizationSlug: owned.identity.organization.slug ?? "missing-slug",
      memoryId: owned.memory.id,
      headers,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as EntryListBody;
    expect(body.memoryEntries.map((entry) => entry.sourceText)).toEqual(["Owned"]);
  });

  it("rejects invalid, tampered, expired, and filter-mismatched cursors", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    await fixture.insertMemoryEntry(memory.id, { sourceText: "One", targetText: "Uno" });

    const invalid = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { cursor: "not-a-cursor" },
    });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ error: "invalid_cursor" });

    const validCursor = encodeMemoryEntryCursor({
      filters: { sort: "created_at", sortDir: "desc" },
      id: randomUUID(),
      sortValue: "2026-08-01T12:00:00.000Z",
    });
    const [payload] = validCursor.split(".");
    const tampered = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { cursor: `${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` },
    });
    expect(tampered.status).toBe(400);
    await expect(tampered.json()).resolves.toMatchObject({ error: "invalid_cursor" });

    const expired = encodeMemoryEntryCursor({
      filters: { sort: "created_at", sortDir: "desc" },
      id: randomUUID(),
      sortValue: "2026-08-01T12:00:00.000Z",
      issuedAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    const expiredResponse = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { cursor: expired },
    });
    expect(expiredResponse.status).toBe(400);
    await expect(expiredResponse.json()).resolves.toMatchObject({ error: "invalid_cursor" });

    const mismatched = encodeMemoryEntryCursor({
      filters: { search: "one", sort: "created_at", sortDir: "desc" },
      id: randomUUID(),
      sortValue: "2026-08-01T12:00:00.000Z",
    });
    const mismatchedResponse = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { cursor: mismatched, search: "two" },
    });
    expect(mismatchedResponse.status).toBe(400);
    await expect(mismatchedResponse.json()).resolves.toMatchObject({ error: "invalid_cursor" });
  });

  it("enforces page-size limits server-side", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const tooLarge = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { limit: "101" },
    });
    expect(tooLarge.status).toBe(400);
    await expect(tooLarge.json()).resolves.toMatchObject({ error: "invalid_memory_payload" });

    const tooSmall = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { limit: "0" },
    });
    expect(tooSmall.status).toBe(400);
    await expect(tooSmall.json()).resolves.toMatchObject({ error: "invalid_memory_payload" });
  });

  it("does not duplicate or drop already-seen rows when inserts arrive during paging", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const base = Date.parse("2026-08-01T12:00:00.000Z");

    for (const index of [0, 1, 2, 3]) {
      await fixture.insertMemoryEntry(memory.id, {
        sourceText: `Row ${index}`,
        targetText: `Fila ${index}`,
        createdAt: new Date(base + index * 1000),
      });
    }

    const firstPage = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { limit: "2" },
    });
    const firstBody = (await firstPage.json()) as EntryListBody;
    expect(firstBody.memoryEntries).toHaveLength(2);

    await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Inserted later",
      targetText: "Insertado despues",
      createdAt: new Date(base + 10_000),
    });

    const secondPage = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { limit: "2", cursor: firstBody.nextCursor! },
    });
    const secondBody = (await secondPage.json()) as EntryListBody;
    const pagedIds = [...firstBody.memoryEntries, ...secondBody.memoryEntries].map(
      (entry) => entry.id,
    );

    expect(new Set(pagedIds).size).toBe(pagedIds.length);
    expect(secondBody.memoryEntries.map((entry) => entry.sourceText)).not.toContain(
      "Inserted later",
    );

    const freshFirstPage = await listEntries({
      organizationSlug,
      memoryId: memory.id,
      headers,
      query: { limit: "2" },
    });
    const freshBody = (await freshFirstPage.json()) as EntryListBody;
    expect(freshBody.memoryEntries[0]?.sourceText).toBe("Inserted later");
  });

  it("stamps imported entries with a shared import batch and creator", async () => {
    const { identity, memory, user } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);

    const importResponse = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.import.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
        },
        json: {
          format: "csv",
          content: ["en,es,Hello,Hola,100", "en,fr,Hello,Bonjour,100"].join("\n"),
        },
      },
      { headers },
    );

    expect(importResponse.status).toBe(201);
    const imported = (await importResponse.json()) as {
      imported: number;
      importBatchId: string;
      memoryEntries: Array<{ createdByUserId: string | null; importBatchId: string | null }>;
    };
    expect(imported.imported).toBe(2);
    expect(imported.importBatchId).toEqual(expect.any(String));
    expect(imported.memoryEntries.every((entry) => entry.createdByUserId === user.id)).toBe(true);
    expect(
      imported.memoryEntries.every((entry) => entry.importBatchId === imported.importBatchId),
    ).toBe(true);

    const filtered = await listEntries({
      organizationSlug: identity.organization.slug ?? "missing-slug",
      memoryId: memory.id,
      headers,
      query: { importBatchId: imported.importBatchId, origin: "import" },
    });
    expect(filtered.status).toBe(200);
    expect(((await filtered.json()) as EntryListBody).total).toBe(2);
  });
});
