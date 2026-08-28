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
import { db, schema } from "@/lib/database/client";

import { createMemoryTestFixture } from "./memory.fixture";

const client = testClient(createApp());
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

describe("memory TMX import and export", () => {
  it("previews a TMX dry run without writing entries", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.import.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
        },
        json: {
          format: "tmx",
          dryRun: true,
          content: readTmxFixture("tmx-1.4-inline-codes.tmx"),
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      imported: number;
      dryRun: boolean;
      importBatchId: string | null;
      report: { totalRead: number; created: number; failed: number };
      preview: Array<{ sourceText: string; action: string }>;
    };
    expect(body).toMatchObject({
      imported: 1,
      dryRun: true,
      importBatchId: null,
      report: { totalRead: 1, created: 1, failed: 0 },
    });
    expect(body.preview[0]?.sourceText).toContain('<ph x="1"/>');

    const listed = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
        },
        query: { limit: "50" },
      },
      { headers },
    );
    expect(((await listed.json()) as { total: number }).total).toBe(0);
  });

  it("imports multilingual TMX, then re-imports the same tuids without duplicates", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const first = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.import.$post(
      {
        param: { organizationSlug, memoryId: memory.id },
        json: { format: "tmx", content: readTmxFixture("tmx-phrase-like.tmx") },
      },
      { headers },
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as {
      imported: number;
      report: { created: number; variantCreated: number; updated: number };
    };
    expect(firstBody.report).toMatchObject({
      created: 2,
      variantCreated: 1,
      updated: 0,
    });
    expect(firstBody.imported).toBe(3);

    const second = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.import.$post(
      {
        param: { organizationSlug, memoryId: memory.id },
        json: { format: "tmx", content: readTmxFixture("tmx-phrase-like.tmx") },
      },
      { headers },
    );
    expect(second.status).toBe(201);
    const secondBody = (await second.json()) as {
      imported: number;
      report: { created: number; variantCreated: number; updated: number; skipped: number };
    };
    expect(secondBody.report.created).toBe(0);
    expect(secondBody.report.variantCreated).toBe(0);
    expect(secondBody.report.updated).toBe(3);
    expect(secondBody.imported).toBe(0);

    const listed = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.$get(
      { param: { organizationSlug, memoryId: memory.id }, query: { limit: "50" } },
      { headers },
    );
    expect(((await listed.json()) as { total: number }).total).toBe(3);
  });

  it("exports TMX that re-imports with the same segment text", async () => {
    const { identity, organization, user, memory } = await fixture.createStoredMemoryFixture();
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

    const [secondMemory] = await db
      .insert(schema.memories)
      .values({
        organizationId: organization.id,
        createdByUserId: user.id,
        name: "Import target TM",
      })
      .returning();
    const imported = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.import.$post(
      {
        param: {
          organizationSlug,
          memoryId: secondMemory.id,
        },
        json: { format: "tmx", content: tmx },
      },
      { headers },
    );
    expect(imported.status).toBe(201);
    const body = (await imported.json()) as {
      memoryEntries: Array<{ sourceText: string; targetText: string }>;
      report: { created: number };
    };
    expect(body.report.created).toBe(1);
    expect(body.memoryEntries[0]).toMatchObject({
      sourceText: 'Hello <ph x="1"/> & friends',
      targetText: 'Bonjour <ph x="1"/> & amis',
    });
  });

  it("applies review status from TMX on create and tuid upsert", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const tmx = (status: string) =>
      `<?xml version="1.0" encoding="UTF-8"?><tmx version="1.4"><header srclang="en" creationtool="t" creationtoolversion="1" segtype="sentence" o-tmf="t" adminlang="en" datatype="plaintext"/><body><tu tuid="review-1"><prop type="x-review-status">${status}</prop><tuv xml:lang="en"><seg>Hello</seg></tuv><tuv xml:lang="fr"><seg>Bonjour</seg></tuv></tu></body></tmx>`;

    const created = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.import.$post(
      {
        param: { organizationSlug, memoryId: memory.id },
        json: { format: "tmx", content: tmx("rejected") },
      },
      { headers },
    );
    expect(created.status).toBe(201);

    const listedAfterCreate = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.$get(
      { param: { organizationSlug, memoryId: memory.id }, query: { limit: "50" } },
      { headers },
    );
    const createdEntries = (await listedAfterCreate.json()) as {
      memoryEntries: Array<{ reviewStatus: string }>;
    };
    expect(createdEntries.memoryEntries[0]?.reviewStatus).toBe("rejected");

    const updated = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.import.$post(
      {
        param: { organizationSlug, memoryId: memory.id },
        json: { format: "tmx", content: tmx("pending") },
      },
      { headers },
    );
    expect(updated.status).toBe(201);
    expect(((await updated.json()) as { report: { updated: number } }).report.updated).toBe(1);

    const listedAfterUpdate = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.$get(
      { param: { organizationSlug, memoryId: memory.id }, query: { limit: "50" } },
      { headers },
    );
    const updatedEntries = (await listedAfterUpdate.json()) as {
      memoryEntries: Array<{ reviewStatus: string }>;
      total: number;
    };
    expect(updatedEntries.total).toBe(1);
    expect(updatedEntries.memoryEntries[0]?.reviewStatus).toBe("pending");
  });

  it("fails safely on malformed TMX and never silently truncates oversized files", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const malformed = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.import.$post(
      {
        param: { organizationSlug, memoryId: memory.id },
        json: { format: "tmx", content: "<tmx><body><tu>" },
      },
      { headers },
    );
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ error: "malformed_xml" });

    const units = Array.from({ length: 4 }, (_, index) => {
      return `<tu tuid="u${index}"><tuv xml:lang="en"><seg>S${index}</seg></tuv><tuv xml:lang="fr"><seg>T${index}</seg></tuv></tu>`;
    }).join("");
    const oversized = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.import.$post(
      {
        param: { organizationSlug, memoryId: memory.id },
        json: {
          format: "tmx",
          maxUnits: 3,
          content: `<?xml version="1.0" encoding="UTF-8"?><tmx version="1.4"><header srclang="en" creationtool="t" creationtoolversion="1" segtype="sentence" o-tmf="t" adminlang="en" datatype="plaintext"/><body>${units}</body></tmx>`,
        },
      },
      { headers },
    );
    expect(oversized.status).toBe(400);
    await expect(oversized.json()).resolves.toMatchObject({
      error: "unit_limit_exceeded",
      details: { maxUnits: 3, unitCount: 4 },
    });
  });
});
