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
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { ok } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  translateStringJob: vi.fn(),
  completeAndTrackBillableUsage: vi.fn(),
  recordJobGenerationProvenance: vi.fn(async () => null),
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
        context: { toStringTranslationInput: () => ({ jobInput }) },
      };
    }
  },
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
}));

import { StringTranslationOutputError } from "@/lib/translation/generation";

import {
  completeKeyTranslationJob,
  planKeyTranslationJob,
  translateKeyBatch,
} from "./key-translation-job";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  await projectFixture.cleanup();
});

type KeySpec = {
  key: string;
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
        sourceText: `Text ${spec.key}`,
        normalizedSourceText: `text ${spec.key}`,
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

  it("keeps the usable languages of a partly unusable answer and counts its tokens", async () => {
    const job = await createJob([{ key: "a" }]);
    const plan = await planKeyTranslationJob({ jobId: job.jobId, projectId: job.projectId });
    const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    mocks.translateStringJob.mockRejectedValue(
      new StringTranslationOutputError("translation for locale de-DE exceeds maxLength", usage, [
        { locale: "fr-FR", text: "Bonjour" },
      ]),
    );

    const result = await translateKeyBatch({
      ...batchInput(job, plan!.plannedAt, []),
      items: [{ translationKeyId: job.ids.a!, targetLocales: ["fr-FR", "de-DE"] }],
    });

    expect(result.translated).toEqual({ "fr-FR": 1 });
    expect(result.failed).toEqual({ "de-DE": 1 });
    expect(result.tokenUsage).toMatchObject({ totalTokens: 15 });
    await expect(readTranslation(job.ids.a!, "fr-FR")).resolves.toMatchObject({ text: "Bonjour" });
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

  it("refuses a run that doesn't own the job", async () => {
    const { jobId, organizationId, projectId } = await createJob([{ key: "a" }]);

    await expect(
      completeKeyTranslationJob({
        jobId,
        projectId,
        workflowRunId: "run_2",
        organizationId,
        outcome: { kind: "key_translation_result", stringCount: 1, translated: {}, failed: {} },
        tokenUsage: null,
        madeModelCalls: false,
      }),
    ).rejects.toThrow("is not owned by workflow run run_2");
  });
});
