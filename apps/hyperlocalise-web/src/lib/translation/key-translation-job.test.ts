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

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { ok } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  translateStringJob: vi.fn(),
  completeAndTrackBillableUsage: vi.fn(),
  trackAiCreditUsageInAutumn: vi.fn(),
  captureAnalysis: vi.fn(async (_input: unknown) => undefined),
  recordCompletions: vi.fn(async (_input: unknown) => undefined),
  captureJobStatus: vi.fn(async (_input: unknown) => undefined),
  recordJobGenerationProvenance: vi.fn(async () => null),
  validateSegment: vi.fn(),
  glossaryTerms: [] as Array<{
    sourceTerm: string;
    targetTerm: string;
    targetLocale: string;
    forbidden: boolean;
  }>,
}));

vi.mock("@/lib/translation/generation", async (importOriginal) => ({
  StringTranslationOutputError: (
    await importOriginal<typeof import("@/lib/translation/generation")>()
  ).StringTranslationOutputError,
  OrganizationModelResolver: class {
    async resolve() {
      return {
        ok: true,
        project: { name: "Shop", translationContext: "" },
        modelId: "openai/gpt-5",
        credentialSource: "gateway",
        translateStringJob: mocks.translateStringJob,
      };
    }
  },
}));
vi.mock("@/lib/translation/context", () => ({
  TranslationContextBuilder: class {
    async build(_projectId: string, jobInput: { targetLocales: string[] }) {
      return {
        ok: true,
        use: {},
        context: {
          glossaryTerms: mocks.glossaryTerms,
          toStringTranslationInput: () => ({ jobInput }),
        },
      };
    }
  },
}));
vi.mock("@/lib/go-svc/go-svc-server-client", () => ({
  createGoSvcServerClient: () => ({ qaReport: { validateSegment: mocks.validateSegment } }),
}));
vi.mock("@/lib/reporting/capture", () => ({
  captureAnalysis: mocks.captureAnalysis,
  recordCompletions: mocks.recordCompletions,
  captureJobStatus: mocks.captureJobStatus,
}));
vi.mock("@/lib/flags/workspace-flags", () => ({
  resolveWorkspaceKnowledgeFlag: async () => true,
}));
vi.mock("@/lib/translation/generation-provenance-store", () => ({
  recordJobGenerationProvenance: mocks.recordJobGenerationProvenance,
}));
vi.mock("@/lib/billing/usage-control", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/usage-control")>()),
  completeAndTrackBillableUsage: mocks.completeAndTrackBillableUsage,
  trackAiCreditUsageInAutumn: mocks.trackAiCreditUsageInAutumn,
}));

import { StringTranslationOutputError } from "@/lib/translation/generation";

import {
  captureKeyTranslationAnalysis,
  chargeFailedKeyTranslationRun,
  completeKeyTranslationJob,
  planKeyTranslationJob,
  translateKeyBatch,
} from "./key-translation-job";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  mocks.validateSegment.mockResolvedValue({ checks: [] });
});

afterEach(async () => {
  mocks.translateStringJob.mockReset();
  mocks.completeAndTrackBillableUsage.mockReset();
  mocks.trackAiCreditUsageInAutumn.mockReset();
  mocks.captureAnalysis.mockClear();
  mocks.recordCompletions.mockClear();
  mocks.captureJobStatus.mockClear();
  mocks.recordJobGenerationProvenance.mockReset();
  mocks.validateSegment.mockReset();
  mocks.glossaryTerms.length = 0;
  await projectFixture.cleanup();
});

type KeySpec = {
  key: string;
  sourceText?: string;
  isHidden?: boolean;
  translations?: Record<string, { text: string; status: "needs_review" | "approved" | "draft" }>;
  lockedIn?: string[];
};

async function createJob(specs: KeySpec[], overwriteUnapproved = false) {
  const { organization, project } = await projectFixture.createStoredProjectFixture();
  const [sourceFile] = await db
    .insert(schema.repositorySourceFiles)
    .values({ organizationId: organization.id, projectId: project.id, sourcePath: "en.json" })
    .returning({ id: schema.repositorySourceFiles.id });
  const keyRows = await db
    .insert(schema.projectTranslationKeys)
    .values(
      specs.map((spec) => ({
        organizationId: organization.id,
        projectId: project.id,
        repositorySourceFileId: sourceFile!.id,
        key: spec.key,
        sourceText: spec.sourceText ?? `Text ${spec.key}`,
        normalizedSourceText: (spec.sourceText ?? `Text ${spec.key}`).toLowerCase(),
        isHidden: spec.isHidden ?? false,
      })),
    )
    .returning({ id: schema.projectTranslationKeys.id, key: schema.projectTranslationKeys.key });
  const ids = Object.fromEntries(keyRows.map((row) => [row.key, row.id]));

  for (const spec of specs) {
    for (const [locale, translation] of Object.entries(spec.translations ?? {})) {
      await db.insert(schema.projectTranslations).values({
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: ids[spec.key]!,
        targetLocale: locale,
        text: translation.text,
        status: translation.status,
      });
    }
    for (const locale of spec.lockedIn ?? []) {
      await db.insert(schema.projectContentEditorSegmentLocks).values({
        organizationId: organization.id,
        projectId: project.id,
        targetLocale: locale,
        externalStringId: ids[spec.key]!,
      });
    }
  }

  const jobId = `job_${randomUUID()}`;
  await db.insert(schema.jobs).values({
    id: jobId,
    organizationId: organization.id,
    projectId: project.id,
    kind: "translation",
    status: "running",
    workflowRunId: "run_1",
    inputPayload: {
      sourceLocale: "en-US",
      targetLocales: ["fr-FR", "de-DE"],
      ...(overwriteUnapproved ? { overwriteUnapproved: true } : {}),
    },
  });
  await db.insert(schema.translationJobDetails).values({ jobId, type: "keys" });
  await db
    .insert(schema.translationJobKeys)
    .values(keyRows.map((row) => ({ jobId, translationKeyId: row.id })));

  return { jobId, organizationId: organization.id, projectId: project.id, ids };
}

async function readTranslation(translationKeyId: string, targetLocale: string) {
  const [row] = await db
    .select({
      text: schema.projectTranslations.text,
      status: schema.projectTranslations.status,
      origin: schema.projectTranslations.origin,
      sourceJobId: schema.projectTranslations.sourceJobId,
    })
    .from(schema.projectTranslations)
    .where(
      and(
        eq(schema.projectTranslations.translationKeyId, translationKeyId),
        eq(schema.projectTranslations.targetLocale, targetLocale),
      ),
    );
  return row;
}

function sorted(items: Array<{ translationKeyId: string; targetLocales: string[] }>) {
  return [...items].sort((a, b) => a.translationKeyId.localeCompare(b.translationKeyId));
}

describe("planKeyTranslationJob", () => {
  const specs: KeySpec[] = [
    { key: "empty" },
    { key: "unapproved", translations: { "fr-FR": { text: "Bonjour", status: "needs_review" } } },
    { key: "approved", translations: { "fr-FR": { text: "Salut", status: "approved" } } },
    { key: "blank", translations: { "fr-FR": { text: " ", status: "draft" } } },
    { key: "hidden", isHidden: true },
    { key: "locked", lockedIn: ["fr-FR"] },
  ];

  it("plans missing translations only, never approved, locked or hidden ones", async () => {
    const { jobId, projectId, ids } = await createJob(specs);

    const plan = await planKeyTranslationJob({ jobId, projectId });

    expect(plan?.stringCount).toBe(5);
    expect(plan?.overwriteUnapproved).toBe(false);
    expect(plan?.knowledgeMemoryEnabled).toBe(true);
    expect(sorted(plan!.items)).toEqual(
      sorted([
        { translationKeyId: ids.empty!, targetLocales: ["fr-FR", "de-DE"] },
        { translationKeyId: ids.unapproved!, targetLocales: ["de-DE"] },
        { translationKeyId: ids.approved!, targetLocales: ["de-DE"] },
        { translationKeyId: ids.blank!, targetLocales: ["fr-FR", "de-DE"] },
        { translationKeyId: ids.locked!, targetLocales: ["de-DE"] },
      ]),
    );
  });

  it("also plans translations that are not approved when asked to replace them", async () => {
    const { jobId, projectId, ids } = await createJob(specs, true);

    const plan = await planKeyTranslationJob({ jobId, projectId });

    expect(plan!.items.find((item) => item.translationKeyId === ids.unapproved)).toEqual({
      translationKeyId: ids.unapproved,
      targetLocales: ["fr-FR", "de-DE"],
    });
    expect(
      plan!.items.find((item) => item.translationKeyId === ids.approved)?.targetLocales,
    ).toEqual(["de-DE"]);
  });

  it("plans a Needs review copy of a multi-word source again, but not a one-word copy", async () => {
    const { jobId, projectId, ids } = await createJob([
      { key: "copy", translations: { "fr-FR": { text: "Text copy", status: "needs_review" } } },
      {
        key: "brand",
        sourceText: "Lumora",
        translations: { "fr-FR": { text: "Lumora", status: "needs_review" } },
      },
      {
        key: "name",
        sourceText: "{first} {last}",
        translations: { "fr-FR": { text: "{first} {last}", status: "needs_review" } },
      },
    ]);

    const plan = await planKeyTranslationJob({ jobId, projectId });

    expect(sorted(plan!.items)).toEqual(
      sorted([
        { translationKeyId: ids.copy!, targetLocales: ["fr-FR", "de-DE"] },
        { translationKeyId: ids.brand!, targetLocales: ["de-DE"] },
        { translationKeyId: ids.name!, targetLocales: ["de-DE"] },
      ]),
    );
  });
});

describe("translateKeyBatch", () => {
  it("saves machine translations for review, keeps work done meanwhile, and adds up tokens", async () => {
    const { jobId, organizationId, projectId, ids } = await createJob([
      { key: "a" },
      { key: "b" },
      { key: "c" },
    ]);
    const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15, modelId: "openai/gpt-5" };
    mocks.translateStringJob.mockImplementation(
      async (input: { jobInput: { translationKeyId: string; targetLocales: string[] } }) => {
        const keyId = input.jobInput.translationKeyId;
        if (keyId === ids.c) throw new Error("model timed out");
        if (keyId === ids.b) {
          // Someone types the French translation while the model is answering.
          await db.insert(schema.projectTranslations).values({
            organizationId,
            projectId,
            translationKeyId: keyId,
            targetLocale: "fr-FR",
            text: "Typed by hand",
            status: "draft",
          });
        }
        return {
          translations: input.jobInput.targetLocales.map((locale) => ({
            locale,
            text: `${locale} ${keyId}`,
          })),
          tokenUsage: usage,
        };
      },
    );

    const plan = await planKeyTranslationJob({ jobId, projectId });
    const result = await translateKeyBatch({
      jobId,
      workflowRunId: "run_1",
      plannedAt: plan!.plannedAt,
      projectId,
      organizationId,
      sourceLocale: "en-US",
      overwriteUnapproved: false,
      knowledgeMemoryEnabled: false,
      recordProvenance: true,
      items: [ids.a!, ids.b!, ids.c!].map((translationKeyId) => ({
        translationKeyId,
        targetLocales: ["fr-FR", "de-DE"],
      })),
    });

    expect(result.translated).toEqual({ "fr-FR": 1, "de-DE": 2 });
    expect(result.failed).toEqual({ "fr-FR": 1, "de-DE": 1 });
    expect(result.tokenUsage).toMatchObject({ inputTokens: 20, outputTokens: 10, totalTokens: 30 });
    await expect(readTranslation(ids.a!, "fr-FR")).resolves.toEqual({
      text: `fr-FR ${ids.a}`,
      status: "needs_review",
      origin: "machine",
      sourceJobId: jobId,
    });
    await expect(readTranslation(ids.b!, "fr-FR")).resolves.toMatchObject({
      text: "Typed by hand",
      status: "draft",
    });
    await expect(readTranslation(ids.c!, "fr-FR")).resolves.toBeUndefined();
    expect(mocks.recordJobGenerationProvenance).toHaveBeenCalledTimes(1);
    // Reports gets the saved strings as the AI's finished work, by language.
    const finished: Record<string, Record<string, string>> = {};
    for (const [call] of mocks.recordCompletions.mock.calls) {
      const input = call as { targetLocale: string; sourceEntries: Record<string, string> };
      finished[input.targetLocale] = { ...finished[input.targetLocale], ...input.sourceEntries };
    }
    expect(finished).toEqual({
      "fr-FR": { [ids.a!]: "Text a" },
      "de-DE": { [ids.a!]: "Text a", [ids.b!]: "Text b" },
    });
    expect(mocks.recordCompletions).toHaveBeenCalledWith(
      expect.objectContaining({ jobId, provenance: "automated", source: "ai" }),
    );
  });

  it("records the planned strings for Reports in each language they need", async () => {
    const { jobId, organizationId, projectId, ids } = await createJob([{ key: "a" }, { key: "b" }]);

    await captureKeyTranslationAnalysis({
      jobId,
      projectId,
      organizationId,
      sourceLocale: "en-US",
      items: [
        { translationKeyId: ids.a!, targetLocales: ["fr-FR", "de-DE"] },
        { translationKeyId: ids.b!, targetLocales: ["de-DE"] },
      ],
    });

    const analysed = Object.fromEntries(
      mocks.captureAnalysis.mock.calls.map(([call]) => {
        const input = call as { targetLocale: string; sourceEntries: Record<string, string> };
        return [input.targetLocale, input.sourceEntries];
      }),
    );
    expect(analysed).toEqual({
      "fr-FR": { [ids.a!]: "Text a" },
      "de-DE": { [ids.a!]: "Text a", [ids.b!]: "Text b" },
    });
  });
});

describe("translateKeyBatch when things change mid-run", () => {
  function batchInput(
    job: Awaited<ReturnType<typeof createJob>>,
    plannedAt: string,
    keyIds: string[],
    overwriteUnapproved = false,
  ) {
    return {
      jobId: job.jobId,
      workflowRunId: "run_1",
      plannedAt,
      projectId: job.projectId,
      organizationId: job.organizationId,
      sourceLocale: "en-US",
      overwriteUnapproved,
      knowledgeMemoryEnabled: false,
      recordProvenance: false,
      items: keyIds.map((translationKeyId) => ({ translationKeyId, targetLocales: ["fr-FR"] })),
    };
  }

  it("keeps an edit made after the plan even when replacing unapproved translations", async () => {
    const job = await createJob(
      [
        {
          key: "a",
          translations: { "fr-FR": { text: "Old machine text", status: "needs_review" } },
        },
      ],
      true,
    );
    const plan = await planKeyTranslationJob({ jobId: job.jobId, projectId: job.projectId });
    expect(plan!.items).toEqual([
      { translationKeyId: job.ids.a, targetLocales: ["fr-FR", "de-DE"] },
    ]);
    mocks.translateStringJob.mockImplementation(async () => {
      await db
        .update(schema.projectTranslations)
        .set({ text: "Edited by a reviewer", updatedAt: new Date(Date.now() + 1_000) })
        .where(eq(schema.projectTranslations.translationKeyId, job.ids.a!));
      return { translations: [{ locale: "fr-FR", text: "Nouveau" }] };
    });

    const result = await translateKeyBatch(batchInput(job, plan!.plannedAt, [job.ids.a!], true));

    expect(result.translated).toEqual({});
    await expect(readTranslation(job.ids.a!, "fr-FR")).resolves.toMatchObject({
      text: "Edited by a reviewer",
    });
  });

  it("stops without calling the model or writing once the job is cancelled", async () => {
    const job = await createJob([{ key: "a" }, { key: "b" }]);
    const plan = await planKeyTranslationJob({ jobId: job.jobId, projectId: job.projectId });
    mocks.translateStringJob.mockImplementation(async () => {
      await db
        .update(schema.jobs)
        .set({ status: "cancelled", workflowRunId: null })
        .where(eq(schema.jobs.id, job.jobId));
      return { translations: [{ locale: "fr-FR", text: "Bonjour" }] };
    });

    const first = await translateKeyBatch(batchInput(job, plan!.plannedAt, [job.ids.a!]));
    expect(first.stopped).toBe(true);
    await expect(readTranslation(job.ids.a!, "fr-FR")).resolves.toBeUndefined();

    mocks.translateStringJob.mockClear();
    const second = await translateKeyBatch(batchInput(job, plan!.plannedAt, [job.ids.b!]));
    expect(second.stopped).toBe(true);
    expect(mocks.translateStringJob).not.toHaveBeenCalled();
  });

  function tooLong(usage: { inputTokens: number; outputTokens: number; totalTokens: number }) {
    return new StringTranslationOutputError(
      "translation for locale de-DE exceeds maxLength",
      usage,
      [{ locale: "fr-FR", text: "Bonjour" }],
      new Map([["de-DE", '"Ein viel zu langer Text" is 24 characters; it must be at most 10.']]),
    );
  }

  it("keeps the usable languages of a partly unusable answer and retries the rest once", async () => {
    const job = await createJob([{ key: "a" }]);
    const plan = await planKeyTranslationJob({ jobId: job.jobId, projectId: job.projectId });
    const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    mocks.translateStringJob.mockRejectedValueOnce(tooLong(usage)).mockResolvedValueOnce({
      translations: [{ locale: "de-DE", text: "Kurz" }],
      tokenUsage: usage,
    });

    const result = await translateKeyBatch({
      ...batchInput(job, plan!.plannedAt, []),
      items: [{ translationKeyId: job.ids.a!, targetLocales: ["fr-FR", "de-DE"] }],
    });

    expect(result.translated).toEqual({ "fr-FR": 1, "de-DE": 1 });
    expect(result.failed).toEqual({});
    expect(result.tokenUsage).toMatchObject({ totalTokens: 30 });
    expect(mocks.translateStringJob).toHaveBeenCalledTimes(2);
    const retry = mocks.translateStringJob.mock.calls[1]![0] as {
      jobInput: { targetLocales: string[]; context: string };
    };
    expect(retry.jobInput.targetLocales).toEqual(["de-DE"]);
    expect(retry.jobInput.context).toBe(
      [
        "Your previous translation was rejected. Translate again and fix these problems:",
        '- de-DE: "Ein viel zu langer Text" is 24 characters; it must be at most 10.',
      ].join("\n"),
    );
    await expect(readTranslation(job.ids.a!, "fr-FR")).resolves.toMatchObject({ text: "Bonjour" });
    await expect(readTranslation(job.ids.a!, "de-DE")).resolves.toMatchObject({ text: "Kurz" });
  });

  it("counts a language as failed when the retry is unusable too, and charges both calls", async () => {
    const job = await createJob([{ key: "a" }]);
    const plan = await planKeyTranslationJob({ jobId: job.jobId, projectId: job.projectId });
    const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    mocks.translateStringJob.mockRejectedValue(tooLong(usage));

    const result = await translateKeyBatch({
      ...batchInput(job, plan!.plannedAt, []),
      items: [{ translationKeyId: job.ids.a!, targetLocales: ["fr-FR", "de-DE"] }],
    });

    expect(mocks.translateStringJob).toHaveBeenCalledTimes(2);
    expect(result.translated).toEqual({ "fr-FR": 1 });
    expect(result.failed).toEqual({ "de-DE": 1 });
    expect(result.tokenUsage).toMatchObject({ totalTokens: 30 });
  });

  it("retries a copy of the source once and saves the second answer", async () => {
    const job = await createJob([{ key: "a" }]);
    const plan = await planKeyTranslationJob({ jobId: job.jobId, projectId: job.projectId });
    mocks.translateStringJob
      .mockResolvedValueOnce({ translations: [{ locale: "fr-FR", text: "Text a" }] })
      .mockResolvedValueOnce({ translations: [{ locale: "fr-FR", text: "Texte a" }] });

    const result = await translateKeyBatch(batchInput(job, plan!.plannedAt, [job.ids.a!]));

    expect(result.translated).toEqual({ "fr-FR": 1 });
    const retry = mocks.translateStringJob.mock.calls[1]![0] as { jobInput: { context: string } };
    expect(retry.jobInput.context).toContain(
      "- fr-FR: The translation is a copy of the source text.",
    );
    await expect(readTranslation(job.ids.a!, "fr-FR")).resolves.toMatchObject({ text: "Texte a" });
  });

  it("doesn't save a copy of the source that comes back twice", async () => {
    const job = await createJob([{ key: "a" }]);
    const plan = await planKeyTranslationJob({ jobId: job.jobId, projectId: job.projectId });
    mocks.translateStringJob.mockResolvedValue({
      translations: [{ locale: "fr-FR", text: "Text a" }],
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await translateKeyBatch(batchInput(job, plan!.plannedAt, [job.ids.a!]));

    expect(mocks.translateStringJob).toHaveBeenCalledTimes(2);
    expect(result.translated).toEqual({});
    expect(result.failed).toEqual({ "fr-FR": 1 });
    expect(warn).toHaveBeenCalledWith(
      "[key-translation-job] answer rejected after the retry",
      expect.objectContaining({ locale: "fr-FR", reason: "copy_of_source" }),
    );
    await expect(readTranslation(job.ids.a!, "fr-FR")).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it("retries a translation that breaks the glossary or a placeholder, with the problems", async () => {
    const job = await createJob([{ key: "a" }]);
    const plan = await planKeyTranslationJob({ jobId: job.jobId, projectId: job.projectId });
    mocks.glossaryTerms.push({
      sourceTerm: "Text",
      targetTerm: "Texte",
      targetLocale: "fr-FR",
      forbidden: false,
    });
    mocks.validateSegment
      .mockResolvedValueOnce({
        checks: [
          { id: "format-missing-token", status: "fail", message: "Placeholder {name} is missing." },
        ],
      })
      .mockResolvedValue({ checks: [] });
    mocks.translateStringJob
      .mockResolvedValueOnce({ translations: [{ locale: "fr-FR", text: "Libellé a" }] })
      .mockResolvedValueOnce({ translations: [{ locale: "fr-FR", text: "Texte a" }] });

    const result = await translateKeyBatch(batchInput(job, plan!.plannedAt, [job.ids.a!]));

    expect(result.translated).toEqual({ "fr-FR": 1 });
    const retry = mocks.translateStringJob.mock.calls[1]![0] as { jobInput: { context: string } };
    expect(retry.jobInput.context).toContain('- fr-FR: Use "Texte" for "Text".');
    expect(retry.jobInput.context).toContain("- fr-FR: Placeholder {name} is missing.");
    await expect(readTranslation(job.ids.a!, "fr-FR")).resolves.toMatchObject({ text: "Texte a" });
  });

  it("keeps an answer for review when only a glossary term is still off after the retry", async () => {
    const job = await createJob([{ key: "a" }]);
    const plan = await planKeyTranslationJob({ jobId: job.jobId, projectId: job.projectId });
    mocks.glossaryTerms.push({
      sourceTerm: "Text",
      targetTerm: "Texte",
      targetLocale: "fr-FR",
      forbidden: false,
    });
    mocks.translateStringJob.mockResolvedValue({
      translations: [{ locale: "fr-FR", text: "Libellé a" }],
    });

    const result = await translateKeyBatch(batchInput(job, plan!.plannedAt, [job.ids.a!]));

    expect(mocks.translateStringJob).toHaveBeenCalledTimes(2);
    expect(result.translated).toEqual({ "fr-FR": 1 });
    await expect(readTranslation(job.ids.a!, "fr-FR")).resolves.toMatchObject({
      text: "Libellé a",
    });
  });

  it("fails a language whose format is still broken after the retry", async () => {
    const job = await createJob([{ key: "a" }]);
    const plan = await planKeyTranslationJob({ jobId: job.jobId, projectId: job.projectId });
    mocks.validateSegment.mockResolvedValue({
      checks: [{ id: "format-missing-token", status: "fail", message: "Placeholder missing." }],
    });
    mocks.translateStringJob.mockResolvedValue({
      translations: [{ locale: "fr-FR", text: "Texte" }],
    });

    const result = await translateKeyBatch(batchInput(job, plan!.plannedAt, [job.ids.a!]));

    expect(mocks.translateStringJob).toHaveBeenCalledTimes(2);
    expect(result.failed).toEqual({ "fr-FR": 1 });
    await expect(readTranslation(job.ids.a!, "fr-FR")).resolves.toBeUndefined();
  });

  it("retries a blank answer like a missing one", async () => {
    const job = await createJob([{ key: "a" }]);
    const plan = await planKeyTranslationJob({ jobId: job.jobId, projectId: job.projectId });
    mocks.translateStringJob
      .mockResolvedValueOnce({ translations: [{ locale: "fr-FR", text: "  " }] })
      .mockResolvedValueOnce({ translations: [{ locale: "fr-FR", text: "Texte a" }] });

    const result = await translateKeyBatch(batchInput(job, plan!.plannedAt, [job.ids.a!]));

    expect(result.translated).toEqual({ "fr-FR": 1 });
    const retry = mocks.translateStringJob.mock.calls[1]![0] as { jobInput: { context: string } };
    expect(retry.jobInput.context).toContain("- fr-FR: No translation came back.");
  });

  it("saves the first answer's good languages when the retry call fails", async () => {
    const job = await createJob([{ key: "a" }]);
    const plan = await planKeyTranslationJob({ jobId: job.jobId, projectId: job.projectId });
    mocks.translateStringJob
      .mockRejectedValueOnce(tooLong({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }))
      .mockRejectedValueOnce(new Error("rate limited"));

    const result = await translateKeyBatch({
      ...batchInput(job, plan!.plannedAt, []),
      items: [{ translationKeyId: job.ids.a!, targetLocales: ["fr-FR", "de-DE"] }],
    });

    expect(result.translated).toEqual({ "fr-FR": 1 });
    expect(result.failed).toEqual({ "de-DE": 1 });
    expect(result.tokenUsage).toMatchObject({ totalTokens: 15 });
    await expect(readTranslation(job.ids.a!, "fr-FR")).resolves.toMatchObject({ text: "Bonjour" });
  });

  it("saves the translation without the format check when go-svc can't be reached", async () => {
    const job = await createJob([{ key: "a" }]);
    const plan = await planKeyTranslationJob({ jobId: job.jobId, projectId: job.projectId });
    mocks.validateSegment.mockRejectedValue(new Error("go-svc unavailable"));
    mocks.translateStringJob.mockResolvedValue({
      translations: [{ locale: "fr-FR", text: "Texte a" }],
    });

    const result = await translateKeyBatch(batchInput(job, plan!.plannedAt, [job.ids.a!]));

    expect(result.translated).toEqual({ "fr-FR": 1 });
    expect(mocks.translateStringJob).toHaveBeenCalledTimes(1);
  });

  it("makes no retry call once the job is cancelled", async () => {
    const job = await createJob([{ key: "a" }]);
    const plan = await planKeyTranslationJob({ jobId: job.jobId, projectId: job.projectId });
    mocks.translateStringJob.mockImplementation(async () => {
      await db
        .update(schema.jobs)
        .set({ status: "cancelled", workflowRunId: null })
        .where(eq(schema.jobs.id, job.jobId));
      throw tooLong({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    });

    const result = await translateKeyBatch({
      ...batchInput(job, plan!.plannedAt, []),
      items: [{ translationKeyId: job.ids.a!, targetLocales: ["fr-FR", "de-DE"] }],
    });

    expect(result.stopped).toBe(true);
    expect(mocks.translateStringJob).toHaveBeenCalledTimes(1);
    await expect(readTranslation(job.ids.a!, "fr-FR")).resolves.toBeUndefined();
  });
});

describe("chargeFailedKeyTranslationRun", () => {
  it("charges the run's tokens once under its own key, without the job", async () => {
    mocks.trackAiCreditUsageInAutumn.mockResolvedValue(ok({ status: "tracking_succeeded" }));
    const tokenUsage = {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      modelId: "openai/gpt-5",
      credentialSource: "gateway" as const,
    };

    await chargeFailedKeyTranslationRun({
      jobId: "job_1",
      workflowRunId: "run_1",
      organizationId: "org_1",
      tokenUsage,
    });

    expect(mocks.trackAiCreditUsageInAutumn).toHaveBeenCalledWith({
      organizationId: "org_1",
      parentOperationKey: "job:job_1:run:run_1",
      tokenUsage,
      source: "translation_job_failed",
      modelId: "openai/gpt-5",
      credentialSource: "gateway",
      jobId: "job_1",
    });
    expect(mocks.completeAndTrackBillableUsage).not.toHaveBeenCalled();
  });
});

describe("completeKeyTranslationJob", () => {
  it("charges the job once with its tokens, and not at all when no model was called", async () => {
    const charged = await createJob([{ key: "a" }]);
    mocks.completeAndTrackBillableUsage.mockResolvedValue(ok(undefined));
    const outcome = {
      kind: "key_translation_result" as const,
      stringCount: 1,
      translated: { "fr-FR": 1 },
      failed: {},
    };
    const tokenUsage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

    await completeKeyTranslationJob({
      jobId: charged.jobId,
      projectId: charged.projectId,
      workflowRunId: "run_1",
      organizationId: charged.organizationId,
      outcome,
      tokenUsage,
      madeModelCalls: true,
    });

    expect(mocks.completeAndTrackBillableUsage).toHaveBeenCalledTimes(1);
    // Reports closes the task, as for a file job (and charges a fixed fee set on it).
    expect(mocks.captureJobStatus).toHaveBeenCalledWith({
      jobId: charged.jobId,
      status: "succeeded",
    });
    expect(mocks.completeAndTrackBillableUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: `job:${charged.jobId}:translation_jobs`,
        tokenUsage,
        jobId: charged.jobId,
      }),
    );
    const [stored] = await db
      .select({ status: schema.jobs.status, outcomePayload: schema.jobs.outcomePayload })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, charged.jobId));
    expect(stored).toEqual({ status: "succeeded", outcomePayload: outcome });

    mocks.completeAndTrackBillableUsage.mockClear();
    const nothingToDo = await createJob([{ key: "a" }]);
    await completeKeyTranslationJob({
      jobId: nothingToDo.jobId,
      projectId: nothingToDo.projectId,
      workflowRunId: "run_1",
      organizationId: nothingToDo.organizationId,
      outcome: { ...outcome, translated: {} },
      tokenUsage: null,
      madeModelCalls: false,
    });
    expect(mocks.completeAndTrackBillableUsage).not.toHaveBeenCalled();
  });

  it("leaves a job this run no longer owns as it is and charges nothing", async () => {
    const { jobId, organizationId, projectId } = await createJob([{ key: "a" }]);

    await expect(
      completeKeyTranslationJob({
        jobId,
        projectId,
        workflowRunId: "run_2",
        organizationId,
        outcome: { kind: "key_translation_result", stringCount: 1, translated: {}, failed: {} },
        tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        madeModelCalls: true,
      }),
    ).resolves.toEqual({ completed: false });
    expect(mocks.completeAndTrackBillableUsage).not.toHaveBeenCalled();
    expect(mocks.captureJobStatus).not.toHaveBeenCalled();
    const [stored] = await db
      .select({ status: schema.jobs.status })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, jobId));
    expect(stored?.status).toBe("running");
  });
});
