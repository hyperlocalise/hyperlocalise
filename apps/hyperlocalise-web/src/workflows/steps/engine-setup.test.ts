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

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { extractEngineSignalsMock, readSetupDocumentContentMock } = vi.hoisted(() => ({
  extractEngineSignalsMock: vi.fn(),
  readSetupDocumentContentMock: vi.fn(async () => ""),
}));

vi.mock("@/lib/engine-setup/extract-engine-signals", () => ({
  extractEngineSignals: extractEngineSignalsMock,
}));

vi.mock("@/lib/engine-setup/setup-guideline-document", () => ({
  readSetupGuidelineDocumentContentByOrganization: readSetupDocumentContentMock,
}));

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { acmeHomePage, acmePricingPage } from "@/lib/engine-setup/engine-setup.fixture";
import { createEngineSetupRun, findEngineSetupRun } from "@/lib/engine-setup/store";
import { err, isErr, ok } from "@/lib/primitives/result/results";

import { analyzeEngineSetupStep, prepareEngineSetupStep } from "./engine-setup";

const fixture = createAuthTestFixture();

async function preparedRun(sourceLocale: string | null = null) {
  const identity = fixture.createWorkosIdentity();
  await fixture.authHeadersFor(identity);
  const organizationId = globalThis.__testApiAuthContext?.organization.localOrganizationId ?? "";
  const created = await createEngineSetupRun({
    organizationId,
    createdByUserId: null,
    sourceUrl: "https://acme.test/",
    sourceLocale,
  });
  if (isErr(created)) throw new Error(created.error.code);
  const prepared = await prepareEngineSetupStep({ runId: created.value.id });
  if (!prepared.ok) throw new Error(prepared.code);
  return prepared;
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("engine setup workflow steps", () => {
  it("claims a queued run only once", async () => {
    const prepared = await preparedRun();
    await expect(prepareEngineSetupStep({ runId: prepared.runId })).resolves.toEqual({
      ok: false,
      code: "engine_setup_run_already_started",
    });
  });

  it("stores grounded suggestions and detects the source locale", async () => {
    const prepared = await preparedRun();
    extractEngineSignalsMock.mockResolvedValue(
      ok({
        terms: [
          {
            term: "Flow Studio",
            termType: "product",
            translatable: false,
            definition: "Review workspace.",
            confidence: 90,
            evidence: [],
          },
          {
            term: "Not On Site",
            termType: "product",
            translatable: false,
            definition: "",
            confidence: 99,
            evidence: [],
          },
        ],
        rules: [],
        voice: null,
      }),
    );

    const result = await analyzeEngineSetupStep({
      runId: prepared.runId,
      organizationId: prepared.organizationId,
      sourceLocale: prepared.sourceLocale,
      pages: [acmeHomePage, acmePricingPage],
    });

    expect(result).toEqual({ ok: true, runId: prepared.runId, suggestionCount: 1 });
    await expect(findEngineSetupRun(prepared.runId)).resolves.toMatchObject({
      status: "ready",
      sourceLocale: "en-AU",
      pagesRead: 2,
    });
    const suggestions = await db
      .select({ dedupeKey: schema.engineSetupSuggestions.dedupeKey })
      .from(schema.engineSetupSuggestions)
      .where(eq(schema.engineSetupSuggestions.runId, prepared.runId));
    expect(suggestions).toEqual([{ dedupeKey: "flow studio" }]);
  });

  it("marks blocked crawls as blocked without calling the model", async () => {
    const prepared = await preparedRun();

    const result = await analyzeEngineSetupStep({
      runId: prepared.runId,
      organizationId: prepared.organizationId,
      sourceLocale: null,
      pages: [],
      blockedReason: "bot_protection",
    });

    expect(result).toEqual({ ok: false, code: "crawl_blocked" });
    expect(extractEngineSignalsMock).not.toHaveBeenCalled();
    await expect(findEngineSetupRun(prepared.runId)).resolves.toMatchObject({
      status: "blocked",
      errorCode: "crawl_blocked",
    });
  });

  it("fails the run when no page could be read", async () => {
    const prepared = await preparedRun();

    const result = await analyzeEngineSetupStep({
      runId: prepared.runId,
      organizationId: prepared.organizationId,
      sourceLocale: null,
      pages: [],
    });

    expect(result).toEqual({ ok: false, code: "crawl_failed" });
    await expect(findEngineSetupRun(prepared.runId)).resolves.toMatchObject({ status: "failed" });
  });

  it("fails the run when extraction fails", async () => {
    const prepared = await preparedRun("de");
    extractEngineSignalsMock.mockResolvedValue(err({ code: "extraction_failed" }));

    const result = await analyzeEngineSetupStep({
      runId: prepared.runId,
      organizationId: prepared.organizationId,
      sourceLocale: prepared.sourceLocale,
      pages: [acmeHomePage],
    });

    expect(result).toEqual({ ok: false, code: "extraction_failed" });
    await expect(findEngineSetupRun(prepared.runId)).resolves.toMatchObject({
      status: "failed",
      errorCode: "extraction_failed",
    });
  });
});
