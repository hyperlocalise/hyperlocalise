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

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";
import { isErr } from "@/lib/primitives/result/results";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

import { listMemoryEntriesPage } from "./memory-entry-list";
import { createMemoryTestFixture } from "./memory.fixture";

const BENCHMARK_ENTRY_COUNT = 2_000;
const LATENCY_TARGET_MS = 200;
const CI_LATENCY_BUDGET_MS = 1_000;

const fixture = createMemoryTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

describe("memory entry search benchmark", () => {
  it("keeps representative large-memory pages within the latency budget", async () => {
    const { memory, user } = await fixture.createStoredMemoryFixture();
    const base = Date.parse("2026-01-01T00:00:00.000Z");
    const batchSize = 200;

    for (let offset = 0; offset < BENCHMARK_ENTRY_COUNT; offset += batchSize) {
      const values = Array.from({ length: batchSize }, (_, index) => {
        const n = offset + index;
        const sourceText = `Checkout step ${n} confirm payment`;
        return {
          memoryId: memory.id,
          sourceLocale: n % 2 === 0 ? "en" : "de",
          targetLocale: n % 3 === 0 ? "es" : "fr",
          sourceText,
          normalizedSourceText: normalizeTranslationMemorySourceText(sourceText),
          targetText: `Pago ${n}`,
          matchScore: 100,
          provenance: n % 5 === 0 ? "import" : "manual",
          reviewStatus: n % 7 === 0 ? "pending" : "approved",
          createdByUserId: user.id,
          metadata: { context: `cart step ${n}` },
          createdAt: new Date(base + n * 1000),
          updatedAt: new Date(base + n * 1000),
        };
      });
      await db.insert(schema.memoryEntries).values(values);
    }

    const measure = async (label: string, query: Parameters<typeof listMemoryEntriesPage>[1]) => {
      const started = performance.now();
      const page = await listMemoryEntriesPage(memory.id, query);
      const elapsedMs = performance.now() - started;
      if (isErr(page)) {
        throw new Error(`${label} returned ${page.error.code}`);
      }
      return { label, elapsedMs, page: page.value };
    };

    const firstPage = await measure("first-page", {
      limit: 50,
      sort: "created_at",
      sortDir: "desc",
    });
    const nextPage = await measure("second-page", {
      limit: 50,
      sort: "created_at",
      sortDir: "desc",
      cursor: firstPage.page.nextCursor ?? undefined,
    });
    const filtered = await measure("combined-filters", {
      limit: 50,
      sort: "created_at",
      sortDir: "desc",
      sourceLocale: "en",
      targetLocale: "es",
      reviewStatus: "approved",
      origin: "manual",
      search: "checkout payment",
    });

    for (const result of [firstPage, nextPage, filtered]) {
      expect(result.page.pagination.returned).toBeGreaterThan(0);
      expect(result.elapsedMs).toBeLessThan(CI_LATENCY_BUDGET_MS);
    }

    console.info(
      JSON.stringify({
        benchmark: "memory-entry-search",
        entries: BENCHMARK_ENTRY_COUNT,
        targetMs: LATENCY_TARGET_MS,
        samples: {
          firstPageMs: Math.round(firstPage.elapsedMs),
          secondPageMs: Math.round(nextPage.elapsedMs),
          combinedFiltersMs: Math.round(filtered.elapsedMs),
        },
      }),
    );
  });
});
