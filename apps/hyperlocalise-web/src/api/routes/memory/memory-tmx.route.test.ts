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

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";

import { createMemoryTestFixture } from "./memory.fixture";

const client = testClient<AppType>(createApp());
const fixture = createMemoryTestFixture(client);
const fixtureDir = dirname(fileURLToPath(import.meta.url));

function readTmxFixture(name: string) {
  return readFileSync(join(fixtureDir, "../../../lib/memory/tmx/fixtures", name), "utf8");
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("memory TMX export and interchange history", () => {
  it("lists queued and completed exports in interchange history", async () => {
    const { identity, memory, organization, user } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    await db.insert(schema.memoryImportAttempts).values([
      {
        organizationId: organization.id,
        memoryId: memory.id,
        createdByUserId: user.id,
        operation: "export",
        status: "queued",
        mode: "export",
        format: "tmx",
      },
      {
        organizationId: organization.id,
        memoryId: memory.id,
        createdByUserId: user.id,
        operation: "export",
        status: "completed",
        mode: "export",
        format: "csv",
        resultFilename: "product-tm.csv",
        resultObjectKey: "memory-interchange/export/product-tm.csv",
        counts: { entries: 4 },
      },
    ]);

    const history = await client.api.orgs[":organizationSlug"]["translation-memories"][":memoryId"][
      "import-attempts"
    ].$get(
      {
        param: { organizationSlug, memoryId: memory.id },
        query: { limit: "25" },
      },
      { headers },
    );
    expect(history.status).toBe(200);
    const body = (await history.json()) as {
      total: number;
      memoryImportAttempts: Array<{
        operation: string;
        status: string;
        resultFilename: string | null;
        resultReady: boolean;
        counts: { entries?: number } | null;
      }>;
    };
    expect(body.total).toBe(2);
    expect(body.memoryImportAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "export",
          status: "queued",
          resultFilename: null,
          resultReady: false,
          counts: null,
        }),
        expect.objectContaining({
          operation: "export",
          status: "completed",
          resultFilename: "product-tm.csv",
          resultReady: true,
          counts: { entries: 4 },
        }),
      ]),
    );
  });

  it("returns export details and keeps the JSON report import-only", async () => {
    const { identity, memory, organization, user } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const [failed] = await db
      .insert(schema.memoryImportAttempts)
      .values({
        organizationId: organization.id,
        memoryId: memory.id,
        createdByUserId: user.id,
        operation: "export",
        status: "failed",
        mode: "export",
        format: "tmx",
        failureCode: "export_failed",
        failureMessage: "The export file could not be written.",
      })
      .returning({ id: schema.memoryImportAttempts.id });

    const detail = await client.api.orgs[":organizationSlug"]["translation-memories"][":memoryId"][
      "import-attempts"
    ][":attemptId"].$get(
      {
        param: { organizationSlug, memoryId: memory.id, attemptId: failed.id },
      },
      { headers },
    );
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({
      memoryImportAttempt: {
        id: failed.id,
        operation: "export",
        failureCode: "export_failed",
        failureMessage: "The export file could not be written.",
      },
      diagnostics: [],
    });

    const report = await client.api.orgs[":organizationSlug"]["translation-memories"][":memoryId"][
      "import-attempts"
    ][":attemptId"].report.$get(
      {
        param: { organizationSlug, memoryId: memory.id, attemptId: failed.id },
      },
      { headers },
    );
    expect(report.status).toBe(404);
  });

  it("paginates interchange history and scopes attempts to their memory", async () => {
    const { identity, memory, organization, user } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const [first, second] = await db
      .insert(schema.memoryImportAttempts)
      .values([
        {
          organizationId: organization.id,
          memoryId: memory.id,
          createdByUserId: user.id,
          operation: "import",
          status: "completed",
          mode: "preview",
          format: "tmx",
          counts: {
            totalRead: 1,
            created: 1,
            updated: 0,
            variantCreated: 0,
            skipped: 0,
            warned: 0,
            failed: 0,
          },
        },
        {
          organizationId: organization.id,
          memoryId: memory.id,
          createdByUserId: user.id,
          operation: "import",
          status: "failed",
          mode: "preview",
          format: "csv",
          failureCode: "malformed_xml",
          counts: {
            totalRead: 0,
            created: 0,
            updated: 0,
            variantCreated: 0,
            skipped: 0,
            warned: 0,
            failed: 1,
          },
        },
      ])
      .returning({ id: schema.memoryImportAttempts.id });

    const firstPage = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ]["import-attempts"].$get(
      {
        param: { organizationSlug, memoryId: memory.id },
        query: { limit: "1" },
      },
      { headers },
    );
    const firstPageBody = (await firstPage.json()) as {
      memoryImportAttempts: Array<{ id: string }>;
      nextCursor: string;
      pagination: { hasMore: boolean };
    };
    expect(firstPageBody.pagination).toMatchObject({ hasMore: true });

    const secondPage = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ]["import-attempts"].$get(
      {
        param: { organizationSlug, memoryId: memory.id },
        query: { limit: "1", cursor: firstPageBody.nextCursor },
      },
      { headers },
    );
    const secondPageBody = (await secondPage.json()) as {
      memoryImportAttempts: Array<{ id: string }>;
      pagination: { hasMore: boolean };
    };
    expect(secondPageBody.pagination).toMatchObject({ hasMore: false });
    expect(
      new Set([
        firstPageBody.memoryImportAttempts[0]?.id,
        secondPageBody.memoryImportAttempts[0]?.id,
      ]),
    ).toEqual(new Set([first.id, second.id]));

    const [otherMemory] = await db
      .insert(schema.memories)
      .values({
        organizationId: organization.id,
        createdByUserId: user.id,
        name: "Other memory",
      })
      .returning();
    const inaccessible = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ]["import-attempts"][":attemptId"].$get(
      {
        param: {
          organizationSlug,
          memoryId: otherMemory.id,
          attemptId: first.id,
        },
      },
      { headers },
    );
    expect(inaccessible.status).toBe(404);
  });

  it("exports CSV with the entry segment text", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    await fixture.insertMemoryEntry(memory.id, {
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Hello, world",
      targetText: "Bonjour le monde",
    });

    const exported = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.export.$get(
      { param: { organizationSlug, memoryId: memory.id }, query: { format: "csv" } },
      { headers },
    );
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-type")).toContain("csv");
    const csv = await exported.text();
    expect(csv).toContain("source_locale");
    expect(csv).toContain("Hello, world");
  });

  it("exports TMX with inline placeholders", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    await fixture.insertMemoryEntry(memory.id, {
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: 'Hello <ph x="1"/> & friends',
      targetText: 'Bonjour <ph x="1"/> & amis',
      externalKey: "tmx:inline-1:en:fr",
      metadata: { tuid: "inline-1", context: "hero", notes: ["Keep the placeholder."] },
    });

    const exported = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.export.$get(
      { param: { organizationSlug, memoryId: memory.id }, query: { format: "tmx" } },
      { headers },
    );
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-type")).toContain("tmx");
    const tmx = await exported.text();
    expect(tmx).toContain('<ph x="1"/>');
    expect(tmx).toContain("&amp;");
  });

});
