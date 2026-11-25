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

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { validatePage, resolveWorkspaceKnowledgeFlag, internalCheck } = vi.hoisted(() => ({
  validatePage: vi.fn(),
  resolveWorkspaceKnowledgeFlag: vi.fn(async () => true),
  internalCheck: vi.fn(),
}));

vi.mock("./validate-page-in-sandbox", () => ({
  validateQaPageInSandbox: validatePage,
  QaCliUnavailableError: class QaCliUnavailableError extends Error {},
}));

vi.mock("@/lib/flags/workspace-flags", () => ({
  resolveWorkspaceKnowledgeFlag,
}));

vi.mock("@/lib/go-svc/go-svc-server-client", () => ({
  createGoSvcServerClient: () => ({
    guidelines: { internalCheck },
  }),
}));

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-request";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";
import type { TranslationQaScanQueue } from "@/lib/workflow/types";

import { DEFAULT_QA_POLICY } from "./qa-policy";
import { DEFAULT_QA_SCORING_POLICY } from "./qa-scoring";
import type { QeGenerate } from "./quality-estimation";
import { emptyTranslationQaSummary } from "./qa-report-store";
import {
  claimTranslationQaRun,
  completeTranslationQaScan,
  estimateTranslationQaQualityPage,
  failTranslationQaRun,
  KEY_PAGE_SIZE,
  reclaimStaleTranslationQaRuns,
  scanTranslationQaPage,
  startTranslationQaScan,
  STALE_RUNNING_SCAN_MS,
  type TranslationQaScanPageResult,
} from "./run-project-qa-scan";

const authFixture = createAuthTestFixture();

beforeAll(async () => {
  validatePage.mockImplementation(
    async (input: { segments: Array<{ id: string; targetText: string }> }) =>
      input.segments.map((segment) => ({
        id: segment.id,
        checks: segment.targetText.trim()
          ? []
          : [
              {
                checkType: "not_localized",
                severity: "error",
                message: "Target value is empty.",
                category: "qa",
                relatedTokens: [],
              },
            ],
        skippedChecks: [],
      })),
  );
  await db.$client.query("select 1");
});

beforeEach(() => {
  resolveWorkspaceKnowledgeFlag.mockReset();
  resolveWorkspaceKnowledgeFlag.mockResolvedValue(true);
  internalCheck.mockReset();
});

async function insertProject(input: {
  organizationId: string;
  userId: string;
  teamId: string;
  source: "native" | "external_tms";
}) {
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      identifier: uniqueTestProjectIdentifier(),
      organizationId: input.organizationId,
      teamId: input.teamId,
      createdByUserId: input.userId,
      name: input.source === "native" ? "Native QA" : "External TMS",
      description: "",
      translationContext: "",
      source: input.source,
      ...(input.source === "external_tms"
        ? { externalProviderKind: "phrase" as const, externalProjectId: "42" }
        : {}),
      sourceLocale: "en-US",
      targetLocales: ["de-DE"],
      qaScanCadence: "off",
    })
    .returning();
  return project!;
}

describe("run-project-qa-scan claim and reclaim", () => {
  it("rejects missing and non-native projects before claiming a run", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const providerProject = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "external_tms",
    });
    const enqueue = vi.fn();
    const queue = { enqueue } as unknown as TranslationQaScanQueue;

    await expect(
      startTranslationQaScan({
        organizationId: organization.id,
        projectId: `project_${randomUUID()}`,
        trigger: "manual",
        createdByUserId: user.id,
        queue,
      }),
    ).resolves.toEqual({ ok: false, code: "project_not_found" });

    await expect(
      startTranslationQaScan({
        organizationId: organization.id,
        projectId: providerProject.id,
        trigger: "manual",
        createdByUserId: user.id,
        queue,
      }),
    ).resolves.toEqual({ ok: false, code: "project_not_native" });

    expect(enqueue).not.toHaveBeenCalled();
  });

  it("returns scan_in_progress when another running scan already holds the lease", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });

    const first = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      createdByUserId: user.id,
    });
    expect(first).toMatchObject({ ok: true });

    const second = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "scheduled",
      createdByUserId: user.id,
    });
    expect(second).toEqual({ ok: false, code: "scan_in_progress" });
  });

  it("reclaims stale running scans so a new claim can proceed", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });

    const staleUpdatedAt = new Date(Date.now() - STALE_RUNNING_SCAN_MS - 60_000);
    const [staleRun] = await db
      .insert(schema.translationQaRuns)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        trigger: "scheduled",
        status: "running",
        createdByUserId: user.id,
        summary: emptyTranslationQaSummary(),
        startedAt: staleUpdatedAt,
        createdAt: staleUpdatedAt,
        updatedAt: staleUpdatedAt,
      })
      .returning({ id: schema.translationQaRuns.id });

    // Drizzle $onUpdateFn may refresh updatedAt on insert; force the lease past the cutoff.
    await db
      .update(schema.translationQaRuns)
      .set({ updatedAt: staleUpdatedAt })
      .where(eq(schema.translationQaRuns.id, staleRun!.id));

    await reclaimStaleTranslationQaRuns({
      organizationId: organization.id,
      projectId: project.id,
    });

    const [reclaimed] = await db
      .select({
        status: schema.translationQaRuns.status,
        errorCode: schema.translationQaRuns.errorCode,
      })
      .from(schema.translationQaRuns)
      .where(eq(schema.translationQaRuns.id, staleRun!.id));
    expect(reclaimed).toMatchObject({
      status: "failed",
      errorCode: "qa_scan_stale",
    });

    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      createdByUserId: user.id,
    });
    expect(claimed).toMatchObject({ ok: true });
  });

  it("fails the claimed run when queue enqueue throws", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });

    const enqueue = vi.fn().mockRejectedValue(new Error("queue unavailable"));
    await expect(
      startTranslationQaScan({
        organizationId: organization.id,
        projectId: project.id,
        trigger: "manual",
        createdByUserId: user.id,
        queue: { enqueue } as unknown as TranslationQaScanQueue,
      }),
    ).rejects.toThrow("queue unavailable");

    expect(enqueue).toHaveBeenCalledOnce();

    const runs = await db
      .select({
        status: schema.translationQaRuns.status,
        errorCode: schema.translationQaRuns.errorCode,
      })
      .from(schema.translationQaRuns)
      .where(eq(schema.translationQaRuns.projectId, project.id));

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: "failed",
      errorCode: "qa_scan_enqueue_failed",
    });
  });

  it("treats complete as already finished when the run is no longer running", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });

    const [run] = await db
      .insert(schema.translationQaRuns)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        trigger: "manual",
        status: "succeeded",
        createdByUserId: user.id,
        summary: emptyTranslationQaSummary(),
        completedAt: new Date(),
      })
      .returning({ id: schema.translationQaRuns.id });

    await expect(
      completeTranslationQaScan({
        runId: run!.id,
        organizationId: organization.id,
        projectId: project.id,
      }),
    ).resolves.toEqual({ ok: true, alreadyCompleted: true });
  });

  it("aggregates finding summaries, counts, and stamps qaScanLastRunAt on success", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });

    await db
      .update(schema.projects)
      .set({ targetLocales: ["de-DE", "fr-FR"] })
      .where(eq(schema.projects.id, project.id));

    const [keyA, keyB] = await db
      .insert(schema.projectTranslationKeys)
      .values([
        {
          organizationId: organization.id,
          projectId: project.id,
          key: "greeting",
          sourceText: "Hello",
          normalizedSourceText: "hello",
        },
        {
          organizationId: organization.id,
          projectId: project.id,
          key: "farewell",
          sourceText: "Goodbye",
          normalizedSourceText: "goodbye",
        },
      ])
      .returning({ id: schema.projectTranslationKeys.id });

    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      createdByUserId: user.id,
    });
    expect(claimed).toMatchObject({ ok: true });
    if (!claimed.ok) {
      throw new Error("expected claimed run");
    }

    await db.insert(schema.translationQaFindings).values([
      {
        runId: claimed.runId,
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: keyA!.id,
        key: "greeting",
        targetLocale: "de-DE",
        checkType: "not_localized",
        severity: "error",
        category: "qa",
        message: "Missing German",
        relatedTokens: [],
        sourceText: "Hello",
        targetText: "",
      },
      {
        runId: claimed.runId,
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: keyA!.id,
        key: "greeting",
        targetLocale: "fr-FR",
        checkType: "same_as_source",
        severity: "warning",
        category: "qa",
        message: "Untranslated French",
        relatedTokens: [],
        sourceText: "Hello",
        targetText: "Hello",
      },
      {
        runId: claimed.runId,
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: keyB!.id,
        key: "farewell",
        targetLocale: "de-DE",
        checkType: "not_localized",
        severity: "error",
        category: "qa",
        message: "Missing German farewell",
        relatedTokens: [],
        sourceText: "Goodbye",
        targetText: "",
      },
    ]);

    await expect(
      completeTranslationQaScan({
        runId: claimed.runId,
        organizationId: organization.id,
        projectId: project.id,
      }),
    ).resolves.toEqual({ ok: true, alreadyCompleted: false });

    const [completed] = await db
      .select({
        status: schema.translationQaRuns.status,
        segmentCount: schema.translationQaRuns.segmentCount,
        findingCount: schema.translationQaRuns.findingCount,
        errorCount: schema.translationQaRuns.errorCount,
        warningCount: schema.translationQaRuns.warningCount,
        summary: schema.translationQaRuns.summary,
        completedAt: schema.translationQaRuns.completedAt,
      })
      .from(schema.translationQaRuns)
      .where(eq(schema.translationQaRuns.id, claimed.runId));

    expect(completed).toMatchObject({
      status: "succeeded",
      // 2 keys × 2 target locales
      segmentCount: 4,
      findingCount: 3,
      errorCount: 2,
      warningCount: 1,
      summary: {
        byCheckType: { not_localized: 2, same_as_source: 1 },
        bySeverity: { error: 2, warning: 1 },
        byLocale: { "de-DE": 2, "fr-FR": 1 },
      },
    });
    expect(completed?.completedAt).toBeInstanceOf(Date);

    const [projectRow] = await db
      .select({ qaScanLastRunAt: schema.projects.qaScanLastRunAt })
      .from(schema.projects)
      .where(eq(schema.projects.id, project.id));
    expect(projectRow?.qaScanLastRunAt?.getTime()).toBe(completed?.completedAt?.getTime());

    await expect(
      completeTranslationQaScan({
        runId: claimed.runId,
        organizationId: organization.id,
        projectId: project.id,
      }),
    ).resolves.toEqual({ ok: true, alreadyCompleted: true });
  });

  it("scores the run with MQM penalties when the project scores translations", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });
    await db
      .update(schema.projects)
      .set({
        targetLocales: ["de-DE", "fr-FR"],
        qaScoringPolicy: {
          ...DEFAULT_QA_SCORING_POLICY,
          enabled: true,
          passThreshold: 90,
          penalties: { placeholder_mismatch: "critical" },
        },
      })
      .where(eq(schema.projects.id, project.id));

    const [key] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        key: "cta",
        // 20 source words per locale.
        sourceText:
          "Start your free trial today and see how quickly your team can ship every release in every market you serve",
        normalizedSourceText: "start your free trial",
      })
      .returning({ id: schema.projectTranslationKeys.id });

    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      createdByUserId: user.id,
    });
    if (!claimed.ok) {
      throw new Error("expected claimed run");
    }

    const finding = {
      runId: claimed.runId,
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key!.id,
      key: "cta",
      category: "qa",
      relatedTokens: [],
      sourceText: "Start",
      targetText: "Start",
    };
    await db.insert(schema.translationQaFindings).values([
      // de-DE: one minor finding → 1 point over 20 words = 95.
      {
        ...finding,
        targetLocale: "de-DE",
        checkType: "glossary_violation",
        severity: "warning",
        message: "Glossary",
      },
      // fr-FR: a critical placeholder finding fails the locale.
      {
        ...finding,
        targetLocale: "fr-FR",
        checkType: "placeholder_mismatch",
        severity: "error",
        message: "Placeholder",
      },
      // An ignored finding costs nothing.
      {
        ...finding,
        targetLocale: "de-DE",
        checkType: "length",
        severity: "error",
        message: "Too long",
        status: "ignored" as const,
      },
    ]);

    await completeTranslationQaScan({
      runId: claimed.runId,
      organizationId: organization.id,
      projectId: project.id,
    });

    const [completed] = await db
      .select({ summary: schema.translationQaRuns.summary })
      .from(schema.translationQaRuns)
      .where(eq(schema.translationQaRuns.id, claimed.runId));

    expect(completed?.summary.quality).toMatchObject({
      model: "mqm",
      threshold: 90,
      wordCount: 40,
      penaltyPoints: 26,
      criticalCount: 1,
      score: 35,
      passed: false,
      byLocale: {
        "de-DE": { score: 95, passed: true, wordCount: 20, penaltyPoints: 1 },
        "fr-FR": { score: 0, passed: false, wordCount: 20, penaltyPoints: 25, criticalCount: 1 },
      },
      penaltyByDimension: { terminology: 1, design_and_markup: 25 },
    });
  });

  it("leaves the score out when the project does not score translations", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });
    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      createdByUserId: user.id,
    });
    if (!claimed.ok) {
      throw new Error("expected claimed run");
    }
    await completeTranslationQaScan({
      runId: claimed.runId,
      organizationId: organization.id,
      projectId: project.id,
    });
    const [completed] = await db
      .select({ summary: schema.translationQaRuns.summary })
      .from(schema.translationQaRuns)
      .where(eq(schema.translationQaRuns.id, claimed.runId));
    expect(completed?.summary.quality).toBeUndefined();
  });

  it("completes a running scan with zero findings and zero keys", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });

    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "scheduled",
      createdByUserId: user.id,
    });
    expect(claimed).toMatchObject({ ok: true });
    if (!claimed.ok) {
      throw new Error("expected claimed run");
    }

    await expect(
      completeTranslationQaScan({
        runId: claimed.runId,
        organizationId: organization.id,
        projectId: project.id,
      }),
    ).resolves.toEqual({ ok: true, alreadyCompleted: false });

    const [completed] = await db
      .select({
        status: schema.translationQaRuns.status,
        segmentCount: schema.translationQaRuns.segmentCount,
        findingCount: schema.translationQaRuns.findingCount,
        errorCount: schema.translationQaRuns.errorCount,
        warningCount: schema.translationQaRuns.warningCount,
        summary: schema.translationQaRuns.summary,
      })
      .from(schema.translationQaRuns)
      .where(eq(schema.translationQaRuns.id, claimed.runId));

    expect(completed).toMatchObject({
      status: "succeeded",
      segmentCount: 0,
      findingCount: 0,
      errorCount: 0,
      warningCount: 0,
      summary: { byCheckType: {}, bySeverity: {}, byLocale: {} },
    });
  });

  it("keeps open findings that this run did not recheck", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });
    const [key] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        key: "greeting",
        sourceText: "Hello",
        normalizedSourceText: "hello",
      })
      .returning({ id: schema.projectTranslationKeys.id });

    const [previousRun] = await db
      .insert(schema.translationQaRuns)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        trigger: "manual",
        status: "succeeded",
        createdByUserId: user.id,
        summary: emptyTranslationQaSummary(),
        completedAt: new Date(),
      })
      .returning({ id: schema.translationQaRuns.id });

    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      createdByUserId: user.id,
    });
    expect(claimed).toMatchObject({ ok: true });
    if (!claimed.ok) {
      throw new Error("expected claimed run");
    }

    await db
      .update(schema.translationQaRuns)
      .set({
        checkPolicy: {
          ...DEFAULT_QA_POLICY,
          glossary_violation: { enabled: false, severity: "warning" },
        },
        summary: {
          ...emptyTranslationQaSummary(),
          skippedChecksByLocale: { "de-DE": ["spelling"] },
        },
      })
      .where(eq(schema.translationQaRuns.id, claimed.runId));

    const finding = {
      runId: previousRun!.id,
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key!.id,
      key: "greeting",
      sourceText: "Hello",
      targetText: "Hello",
      severity: "warning" as const,
      relatedTokens: [] as string[],
      message: "Earlier finding",
    };
    await db.insert(schema.translationQaFindings).values([
      {
        ...finding,
        targetLocale: "de-DE",
        checkType: "spelling",
        category: "spelling",
      },
      {
        ...finding,
        targetLocale: "fr-FR",
        checkType: "spelling",
        category: "spelling",
      },
      {
        ...finding,
        targetLocale: "de-DE",
        checkType: "glossary_violation",
        category: "glossary",
      },
      {
        ...finding,
        targetLocale: "de-DE",
        checkType: "not_localized",
        category: "qa",
        severity: "error",
      },
    ]);

    await expect(
      completeTranslationQaScan({
        runId: claimed.runId,
        organizationId: organization.id,
        projectId: project.id,
      }),
    ).resolves.toEqual({ ok: true, alreadyCompleted: false });

    const findings = await db
      .select({
        checkType: schema.translationQaFindings.checkType,
        targetLocale: schema.translationQaFindings.targetLocale,
        status: schema.translationQaFindings.status,
      })
      .from(schema.translationQaFindings)
      .where(eq(schema.translationQaFindings.runId, previousRun!.id));

    expect(findings).toEqual(
      expect.arrayContaining([
        { checkType: "spelling", targetLocale: "de-DE", status: "open" },
        { checkType: "spelling", targetLocale: "fr-FR", status: "resolved" },
        { checkType: "glossary_violation", targetLocale: "de-DE", status: "open" },
        { checkType: "not_localized", targetLocale: "de-DE", status: "resolved" },
      ]),
    );
  });

  it("keeps previous guideline findings open when the run halted", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });
    const [key] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        key: "greeting",
        sourceText: "Hello",
        normalizedSourceText: "hello",
      })
      .returning({ id: schema.projectTranslationKeys.id });

    const [previousRun] = await db
      .insert(schema.translationQaRuns)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        trigger: "manual",
        status: "succeeded",
        createdByUserId: user.id,
        summary: emptyTranslationQaSummary(),
        completedAt: new Date(),
      })
      .returning({ id: schema.translationQaRuns.id });

    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      createdByUserId: user.id,
    });
    expect(claimed).toMatchObject({ ok: true });
    if (!claimed.ok) {
      throw new Error("expected claimed run");
    }

    await db
      .update(schema.translationQaRuns)
      .set({
        checkPolicy: {
          ...DEFAULT_QA_POLICY,
          guideline: { enabled: true, severity: "warning" },
        },
        summary: {
          ...emptyTranslationQaSummary(),
          guidelineCheckHaltCode: "guideline_check_limit_reached",
        },
      })
      .where(eq(schema.translationQaRuns.id, claimed.runId));

    const finding = {
      runId: previousRun!.id,
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key!.id,
      key: "greeting",
      sourceText: "Hello",
      targetText: "Hello",
      relatedTokens: [] as string[],
      message: "Earlier finding",
    };
    await db.insert(schema.translationQaFindings).values([
      {
        ...finding,
        targetLocale: "de-DE",
        checkType: "guideline",
        category: "qa",
        severity: "warning" as const,
      },
      {
        ...finding,
        targetLocale: "de-DE",
        checkType: "not_localized",
        category: "qa",
        severity: "error" as const,
      },
    ]);

    await expect(
      completeTranslationQaScan({
        runId: claimed.runId,
        organizationId: organization.id,
        projectId: project.id,
      }),
    ).resolves.toEqual({ ok: true, alreadyCompleted: false });

    const findings = await db
      .select({
        checkType: schema.translationQaFindings.checkType,
        status: schema.translationQaFindings.status,
      })
      .from(schema.translationQaFindings)
      .where(eq(schema.translationQaFindings.runId, previousRun!.id));

    expect(findings).toEqual(
      expect.arrayContaining([
        { checkType: "guideline", status: "open" },
        { checkType: "not_localized", status: "resolved" },
      ]),
    );
  });

  it("keeps previous guideline findings open when Knowledge is not enabled", async () => {
    resolveWorkspaceKnowledgeFlag.mockResolvedValue(false);
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });
    const [key] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        key: "greeting",
        sourceText: "Hello",
        normalizedSourceText: "hello",
      })
      .returning({ id: schema.projectTranslationKeys.id });

    const [previousRun] = await db
      .insert(schema.translationQaRuns)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        trigger: "manual",
        status: "succeeded",
        createdByUserId: user.id,
        summary: emptyTranslationQaSummary(),
        completedAt: new Date(),
      })
      .returning({ id: schema.translationQaRuns.id });

    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      createdByUserId: user.id,
    });
    expect(claimed).toMatchObject({ ok: true });
    if (!claimed.ok) {
      throw new Error("expected claimed run");
    }

    await db
      .update(schema.translationQaRuns)
      .set({
        checkPolicy: {
          ...DEFAULT_QA_POLICY,
          guideline: { enabled: true, severity: "warning" },
        },
        summary: {
          ...emptyTranslationQaSummary(),
          guidelineKnowledgeSkipped: true,
        },
      })
      .where(eq(schema.translationQaRuns.id, claimed.runId));

    await db.insert(schema.translationQaFindings).values({
      runId: previousRun!.id,
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key!.id,
      key: "greeting",
      sourceText: "Hello",
      targetText: "Hello",
      relatedTokens: [],
      message: "Earlier finding",
      targetLocale: "de-DE",
      checkType: "guideline",
      category: "qa",
      severity: "warning",
    });

    await expect(
      completeTranslationQaScan({
        runId: claimed.runId,
        organizationId: organization.id,
        projectId: project.id,
      }),
    ).resolves.toEqual({ ok: true, alreadyCompleted: false });

    const findings = await db
      .select({
        checkType: schema.translationQaFindings.checkType,
        status: schema.translationQaFindings.status,
      })
      .from(schema.translationQaFindings)
      .where(eq(schema.translationQaFindings.runId, previousRun!.id));

    expect(findings).toEqual([{ checkType: "guideline", status: "open" }]);
    expect(resolveWorkspaceKnowledgeFlag).not.toHaveBeenCalled();
  });
});

async function scanKeyPage(input: {
  runId: string;
  organizationId: string;
  projectId: string;
  afterKeyId: string | null;
}) {
  let afterKeyId = input.afterKeyId;
  let guidelineBatchOffset: number | undefined;
  let result: TranslationQaScanPageResult = { done: true };
  for (let step = 0; step < 40; step += 1) {
    result = await scanTranslationQaPage({
      runId: input.runId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      afterKeyId,
      guidelineBatchOffset,
      page: step,
    });
    if (result.done || result.guidelineBatchOffset == null) {
      return result;
    }
    afterKeyId = result.afterKeyId;
    guidelineBatchOffset = result.guidelineBatchOffset;
  }
  throw new Error("guideline slices did not finish");
}

describe("scanTranslationQaPage", () => {
  it("returns done when the run is missing or no longer running", async () => {
    await expect(
      scanTranslationQaPage({
        runId: randomUUID(),
        organizationId: `org_${randomUUID()}`,
        projectId: `project_${randomUUID()}`,
        afterKeyId: null,
      }),
    ).resolves.toEqual({ done: true });
  });

  it("pages keys, inserts not_localized findings, and continues until the last page", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });

    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      createdByUserId: user.id,
    });
    expect(claimed).toMatchObject({ ok: true });
    if (!claimed.ok) {
      throw new Error("expected claimed run");
    }

    const keyCount = KEY_PAGE_SIZE + 1;
    const keyRows = Array.from({ length: keyCount }, (_, index) => {
      const label = `key_${String(index).padStart(4, "0")}`;
      return {
        organizationId: organization.id,
        projectId: project.id,
        key: label,
        sourceText: `Source ${label}`,
        normalizedSourceText: `source ${label}`,
      };
    });
    await db.insert(schema.projectTranslationKeys).values(keyRows);

    const firstPage = await scanTranslationQaPage({
      runId: claimed.runId,
      organizationId: organization.id,
      projectId: project.id,
      afterKeyId: null,
    });
    expect(firstPage).toMatchObject({ done: false });
    if (firstPage.done) {
      throw new Error("expected another page");
    }

    const firstPageFindings = await db
      .select({
        translationKeyId: schema.translationQaFindings.translationKeyId,
        checkType: schema.translationQaFindings.checkType,
        targetLocale: schema.translationQaFindings.targetLocale,
      })
      .from(schema.translationQaFindings)
      .where(eq(schema.translationQaFindings.runId, claimed.runId));

    expect(firstPageFindings).toHaveLength(KEY_PAGE_SIZE);
    expect(firstPageFindings.every((row) => row.checkType === "not_localized")).toBe(true);
    expect(firstPageFindings.every((row) => row.targetLocale === "de-DE")).toBe(true);
    expect(firstPageFindings.some((row) => row.translationKeyId === firstPage.afterKeyId)).toBe(
      true,
    );

    const secondPage = await scanTranslationQaPage({
      runId: claimed.runId,
      organizationId: organization.id,
      projectId: project.id,
      afterKeyId: firstPage.afterKeyId,
    });
    expect(secondPage).toEqual({ done: true });

    const allFindings = await db
      .select({ id: schema.translationQaFindings.id })
      .from(schema.translationQaFindings)
      .where(eq(schema.translationQaFindings.runId, claimed.runId));
    expect(allFindings).toHaveLength(keyCount);
  });

  it("inserts guideline findings from go-svc", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });
    await db
      .update(schema.projects)
      .set({
        qaCheckPolicy: {
          ...DEFAULT_QA_POLICY,
          guideline: { enabled: true, severity: "warning" },
        },
      })
      .where(eq(schema.projects.id, project.id));

    const [key] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        key: "greeting",
        sourceText: "Hello",
        normalizedSourceText: "hello",
      })
      .returning({ id: schema.projectTranslationKeys.id });

    await db.insert(schema.projectTranslations).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key!.id,
      targetLocale: "de-DE",
      text: "Hallo",
    });

    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      createdByUserId: user.id,
    });
    expect(claimed).toMatchObject({ ok: true });
    if (!claimed.ok) {
      throw new Error("expected claimed run");
    }

    internalCheck.mockResolvedValueOnce({
      findings: [
        {
          segmentId: key!.id,
          field: "target",
          severity: "error",
          start: 0,
          end: 2,
          message: "Use informal greeting",
          suggestion: "Hi",
          passageId: "p1",
        },
      ],
      passages: [],
      searchAvailable: true,
      model: "openai/gpt-6-luna",
    });

    await expect(
      scanKeyPage({
        runId: claimed.runId,
        organizationId: organization.id,
        projectId: project.id,
        afterKeyId: null,
      }),
    ).resolves.toEqual({ done: true });

    const findings = await db
      .select({
        checkType: schema.translationQaFindings.checkType,
        severity: schema.translationQaFindings.severity,
        message: schema.translationQaFindings.message,
        targetLocale: schema.translationQaFindings.targetLocale,
        relatedTokens: schema.translationQaFindings.relatedTokens,
        passageId: schema.translationQaFindings.passageId,
        reasoningAvailable: schema.translationQaFindings.reasoningAvailable,
      })
      .from(schema.translationQaFindings)
      .where(eq(schema.translationQaFindings.runId, claimed.runId));

    expect(findings).toEqual([
      {
        checkType: "guideline",
        severity: "warning",
        message: "Use informal greeting Suggestion: Hi",
        targetLocale: "de-DE",
        relatedTokens: ["Ha", "Hi"],
        passageId: "p1",
        reasoningAvailable: false,
      },
    ]);
    expect(internalCheck).toHaveBeenCalledWith(
      organization.id,
      expect.objectContaining({
        autoExplain: false,
        projectId: project.id,
        sourceLocale: "en-US",
        targetLocale: "de-DE",
        checks: ["target"],
        segments: [{ id: key!.id, source: "Hello", target: "Hallo" }],
      }),
    );

    const [run] = await db
      .select({ summary: schema.translationQaRuns.summary })
      .from(schema.translationQaRuns)
      .where(eq(schema.translationQaRuns.id, claimed.runId));
    expect(run?.summary.guidelineCheckHaltCode).toBeUndefined();
  });

  it("records a guideline halt when classify hits the allowance", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });
    await db
      .update(schema.projects)
      .set({
        qaCheckPolicy: {
          ...DEFAULT_QA_POLICY,
          guideline: { enabled: true, severity: "warning" },
        },
      })
      .where(eq(schema.projects.id, project.id));

    const [key] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        key: "greeting",
        sourceText: "Hello",
        normalizedSourceText: "hello",
      })
      .returning({ id: schema.projectTranslationKeys.id });

    await db.insert(schema.projectTranslations).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key!.id,
      targetLocale: "de-DE",
      text: "Hallo",
    });

    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      createdByUserId: user.id,
    });
    expect(claimed).toMatchObject({ ok: true });
    if (!claimed.ok) {
      throw new Error("expected claimed run");
    }

    internalCheck.mockRejectedValueOnce(
      new GoSvcClientError({
        code: "guideline_check_limit_reached",
        message: "limit",
        status: 402,
      }),
    );

    await expect(
      scanKeyPage({
        runId: claimed.runId,
        organizationId: organization.id,
        projectId: project.id,
        afterKeyId: null,
      }),
    ).resolves.toEqual({ done: true });

    const [run] = await db
      .select({ summary: schema.translationQaRuns.summary })
      .from(schema.translationQaRuns)
      .where(eq(schema.translationQaRuns.id, claimed.runId));
    expect(run?.summary.guidelineCheckHaltCode).toBe("guideline_check_limit_reached");
  });

  it("records a knowledge skip and does not resolve older guideline findings if the flag recovers", async () => {
    resolveWorkspaceKnowledgeFlag.mockResolvedValue(false);
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });
    await db
      .update(schema.projects)
      .set({
        qaCheckPolicy: {
          ...DEFAULT_QA_POLICY,
          guideline: { enabled: true, severity: "warning" },
        },
      })
      .where(eq(schema.projects.id, project.id));

    const [key] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        key: "greeting",
        sourceText: "Hello",
        normalizedSourceText: "hello",
      })
      .returning({ id: schema.projectTranslationKeys.id });

    await db.insert(schema.projectTranslations).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key!.id,
      targetLocale: "de-DE",
      text: "Hallo",
    });

    const [previousRun] = await db
      .insert(schema.translationQaRuns)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        trigger: "manual",
        status: "succeeded",
        createdByUserId: user.id,
        summary: emptyTranslationQaSummary(),
        completedAt: new Date(),
      })
      .returning({ id: schema.translationQaRuns.id });

    await db.insert(schema.translationQaFindings).values({
      runId: previousRun!.id,
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key!.id,
      key: "greeting",
      sourceText: "Hello",
      targetText: "Hallo",
      relatedTokens: [],
      message: "Earlier finding",
      targetLocale: "de-DE",
      checkType: "guideline",
      category: "qa",
      severity: "warning",
    });

    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      createdByUserId: user.id,
    });
    expect(claimed).toMatchObject({ ok: true });
    if (!claimed.ok) {
      throw new Error("expected claimed run");
    }

    await scanKeyPage({
      runId: claimed.runId,
      organizationId: organization.id,
      projectId: project.id,
      afterKeyId: null,
    });
    expect(internalCheck).not.toHaveBeenCalled();

    const [running] = await db
      .select({ summary: schema.translationQaRuns.summary })
      .from(schema.translationQaRuns)
      .where(eq(schema.translationQaRuns.id, claimed.runId));
    expect(running?.summary.guidelineKnowledgeSkipped).toBe(true);

    resolveWorkspaceKnowledgeFlag.mockResolvedValue(true);
    await completeTranslationQaScan({
      runId: claimed.runId,
      organizationId: organization.id,
      projectId: project.id,
    });

    const findings = await db
      .select({ status: schema.translationQaFindings.status })
      .from(schema.translationQaFindings)
      .where(eq(schema.translationQaFindings.runId, previousRun!.id));
    expect(findings).toEqual([{ status: "open" }]);
  });

  it("checks every locale across guideline slices", async () => {
    const locales = ["de-DE", "es-ES", "fr-FR", "it-IT", "ja-JP"];
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });
    await db
      .update(schema.projects)
      .set({
        targetLocales: locales,
        qaCheckPolicy: {
          ...DEFAULT_QA_POLICY,
          guideline: { enabled: true, severity: "warning" },
        },
      })
      .where(eq(schema.projects.id, project.id));

    const [key] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        key: "greeting",
        sourceText: "Hello",
        normalizedSourceText: "hello",
      })
      .returning({ id: schema.projectTranslationKeys.id });

    await db.insert(schema.projectTranslations).values(
      locales.map((targetLocale) => ({
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: key!.id,
        targetLocale,
        text: "Hallo",
      })),
    );

    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      createdByUserId: user.id,
    });
    expect(claimed).toMatchObject({ ok: true });
    if (!claimed.ok) {
      throw new Error("expected claimed run");
    }

    internalCheck.mockResolvedValue({
      findings: [],
      passages: [],
      searchAvailable: true,
      model: "typesafe-ai/jev",
    });

    await expect(
      scanKeyPage({
        runId: claimed.runId,
        organizationId: organization.id,
        projectId: project.id,
        afterKeyId: null,
      }),
    ).resolves.toEqual({ done: true });
    expect(internalCheck).toHaveBeenCalledTimes(locales.length);
    expect(
      internalCheck.mock.calls
        .map((call) => call[1].targetLocale ?? "")
        .toSorted((left, right) => left.localeCompare(right)),
    ).toEqual(locales);
  });
});

describe("scoped QA scans", () => {
  it("checks and resolves only the scope's file and languages", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });
    await db
      .update(schema.projects)
      .set({ targetLocales: ["de-DE", "fr-FR"] })
      .where(eq(schema.projects.id, project.id));
    const [fileA, fileB] = await db
      .insert(schema.repositorySourceFiles)
      .values(
        ["a.json", "b.json"].map((sourcePath) => ({
          organizationId: organization.id,
          projectId: project.id,
          sourcePath,
        })),
      )
      .returning({ id: schema.repositorySourceFiles.id });
    const [keyA, keyB] = await db
      .insert(schema.projectTranslationKeys)
      .values(
        [
          { key: "a", repositorySourceFileId: fileA!.id },
          { key: "b", repositorySourceFileId: fileB!.id },
        ].map((row) => ({
          ...row,
          organizationId: organization.id,
          projectId: project.id,
          sourceText: `Source ${row.key}`,
          normalizedSourceText: `source ${row.key}`,
        })),
      )
      .returning({ id: schema.projectTranslationKeys.id });

    const [previousRun] = await db
      .insert(schema.translationQaRuns)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        trigger: "manual",
        status: "succeeded",
        createdByUserId: user.id,
        summary: emptyTranslationQaSummary(),
        completedAt: new Date(),
      })
      .returning({ id: schema.translationQaRuns.id });
    const earlier = {
      runId: previousRun!.id,
      organizationId: organization.id,
      projectId: project.id,
      sourceText: "Source",
      targetText: "Source",
      severity: "warning" as const,
      relatedTokens: [] as string[],
      message: "Earlier finding",
      checkType: "spelling",
      category: "spelling",
    };
    await db.insert(schema.translationQaFindings).values([
      { ...earlier, translationKeyId: keyA!.id, key: "a", targetLocale: "de-DE" },
      { ...earlier, translationKeyId: keyA!.id, key: "a", targetLocale: "fr-FR" },
      { ...earlier, translationKeyId: keyB!.id, key: "b", targetLocale: "de-DE" },
    ]);

    const scope = { repositorySourceFileId: fileA!.id, targetLocales: ["de-DE"] };
    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      createdByUserId: user.id,
      scope,
    });
    if (!claimed.ok) {
      throw new Error("expected claimed run");
    }
    const run = { runId: claimed.runId, organizationId: organization.id, projectId: project.id };

    await expect(scanTranslationQaPage({ ...run, afterKeyId: null })).resolves.toEqual({
      done: true,
    });
    const checked = await db
      .select({
        translationKeyId: schema.translationQaFindings.translationKeyId,
        targetLocale: schema.translationQaFindings.targetLocale,
      })
      .from(schema.translationQaFindings)
      .where(eq(schema.translationQaFindings.runId, claimed.runId));
    expect(checked).toEqual([{ translationKeyId: keyA!.id, targetLocale: "de-DE" }]);

    await completeTranslationQaScan(run);

    const [completed] = await db
      .select({
        segmentCount: schema.translationQaRuns.segmentCount,
        summary: schema.translationQaRuns.summary,
      })
      .from(schema.translationQaRuns)
      .where(eq(schema.translationQaRuns.id, claimed.runId));
    expect(completed?.segmentCount).toBe(1);
    expect(completed?.summary.scope).toEqual(scope);

    const earlierFindings = await db
      .select({
        translationKeyId: schema.translationQaFindings.translationKeyId,
        targetLocale: schema.translationQaFindings.targetLocale,
        status: schema.translationQaFindings.status,
      })
      .from(schema.translationQaFindings)
      .where(eq(schema.translationQaFindings.runId, previousRun!.id));
    // The scoped run rechecked key a in de-DE only; the rest stays as it was.
    expect(earlierFindings).toEqual(
      expect.arrayContaining([
        { translationKeyId: keyA!.id, targetLocale: "de-DE", status: "resolved" },
        { translationKeyId: keyA!.id, targetLocale: "fr-FR", status: "open" },
        { translationKeyId: keyB!.id, targetLocale: "de-DE", status: "open" },
      ]),
    );
  });
});

describe("run-project-qa-scan notifications", () => {
  async function setupNativeProject() {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });
    return { organization, user, project };
  }

  async function insertPreviousSucceededRun(input: {
    organizationId: string;
    projectId: string;
    errorCount: number;
  }) {
    const earlier = new Date(Date.now() - 60_000);
    await db.insert(schema.translationQaRuns).values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      trigger: "scheduled",
      status: "succeeded",
      errorCount: input.errorCount,
      summary: emptyTranslationQaSummary(),
      createdAt: earlier,
      completedAt: earlier,
    });
  }

  async function qaNotifications(runId: string) {
    return db
      .select({
        recipientUserId: schema.issueNotifications.recipientUserId,
        issueId: schema.issueNotifications.issueId,
        type: schema.issueNotifications.type,
        payload: schema.issueNotifications.payload,
      })
      .from(schema.issueNotifications)
      .where(eq(schema.issueNotifications.qaRunId, runId));
  }

  it("notifies QA managers once when a scan finds more errors than the previous scan", async () => {
    const { organization, user, project } = await setupNativeProject();
    await insertPreviousSucceededRun({
      organizationId: organization.id,
      projectId: project.id,
      errorCount: 1,
    });
    const [key] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        key: "greeting",
        sourceText: "Hello",
        normalizedSourceText: "hello",
      })
      .returning({ id: schema.projectTranslationKeys.id });
    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      createdByUserId: user.id,
    });
    if (!claimed.ok) {
      throw new Error("expected claimed run");
    }
    const finding = {
      runId: claimed.runId,
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key!.id,
      key: "greeting",
      checkType: "not_localized" as const,
      severity: "error" as const,
      category: "qa",
      message: "Missing translation",
      relatedTokens: [],
      sourceText: "Hello",
      targetText: "",
    };
    await db.insert(schema.translationQaFindings).values([
      { ...finding, targetLocale: "de-DE" },
      { ...finding, targetLocale: "fr-FR" },
    ]);

    const completeInput = {
      runId: claimed.runId,
      organizationId: organization.id,
      projectId: project.id,
    };
    await completeTranslationQaScan(completeInput);
    await completeTranslationQaScan(completeInput);

    expect(await qaNotifications(claimed.runId)).toEqual([
      {
        recipientUserId: user.id,
        issueId: null,
        type: "qa_errors_increased",
        payload: {
          issueTitle: "Native QA",
          projectId: project.id,
          errorCount: 2,
          errorsChange: 1,
        },
      },
    ]);
  });

  it("does not notify when a scan finds no more errors than the previous scan", async () => {
    const { organization, user, project } = await setupNativeProject();
    await insertPreviousSucceededRun({
      organizationId: organization.id,
      projectId: project.id,
      errorCount: 3,
    });
    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      createdByUserId: user.id,
    });
    if (!claimed.ok) {
      throw new Error("expected claimed run");
    }

    await completeTranslationQaScan({
      runId: claimed.runId,
      organizationId: organization.id,
      projectId: project.id,
    });

    expect(await qaNotifications(claimed.runId)).toEqual([]);
  });

  it("notifies QA managers once when a running scan fails", async () => {
    const { organization, user, project } = await setupNativeProject();
    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "scheduled",
    });
    if (!claimed.ok) {
      throw new Error("expected claimed run");
    }

    const failInput = {
      runId: claimed.runId,
      errorCode: "qa_scan_failed",
      errorMessage: "Sandbox crashed.",
    };
    await failTranslationQaRun(failInput);
    await failTranslationQaRun(failInput);

    expect(await qaNotifications(claimed.runId)).toEqual([
      {
        recipientUserId: user.id,
        issueId: null,
        type: "qa_scan_failed",
        payload: {
          issueTitle: "Native QA",
          projectId: project.id,
          errorCode: "qa_scan_failed",
        },
      },
    ]);
  });
});

describe("quality estimation", () => {
  /** Scores each segment in the prompt: a changed number scores 30, anything else 95. */
  function scoringModel(): QeGenerate {
    return vi.fn<QeGenerate>(async ({ prompt }) => {
      const rows = JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n") + 2)) as Array<{
        id: string;
        translation: string;
      }>;
      return {
        segments: rows.map((row) => ({
          id: row.id,
          score: row.translation.includes("3 Tabletten") ? 30 : 95,
          reason: row.translation.includes("3 Tabletten") ? "Dosage changed." : "No issues found.",
        })),
      };
    });
  }

  async function setUpEstimatedProject() {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const project = await insertProject({
      organizationId: organization.id,
      userId: user.id,
      teamId: team.id,
      source: "native",
    });
    await db
      .update(schema.projects)
      .set({
        qaCheckPolicy: {
          ...DEFAULT_QA_POLICY,
          quality_estimate: { enabled: true, severity: "error" },
        },
        qaScoringPolicy: {
          ...DEFAULT_QA_SCORING_POLICY,
          enabled: true,
          estimationThreshold: 70,
          domain: "legal",
        },
      })
      .where(eq(schema.projects.id, project.id));
    const keys = await db
      .insert(schema.projectTranslationKeys)
      .values(
        [
          ["dose", "Take 2 tablets daily"],
          ["save", "Save"],
          ["empty", "Cancel"],
        ].map(([key, sourceText]) => ({
          organizationId: organization.id,
          projectId: project.id,
          key: key!,
          sourceText: sourceText!,
          normalizedSourceText: sourceText!.toLowerCase(),
        })),
      )
      .returning({ id: schema.projectTranslationKeys.id, key: schema.projectTranslationKeys.key });
    const keyId = (name: string) => keys.find((row) => row.key === name)!.id;
    await db.insert(schema.projectTranslations).values([
      {
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: keyId("dose"),
        targetLocale: "de-DE",
        text: "Nehmen Sie täglich 3 Tabletten",
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: keyId("save"),
        targetLocale: "de-DE",
        text: "Speichern",
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: keyId("empty"),
        targetLocale: "de-DE",
        text: "  ",
      },
    ]);
    const claimed = await claimTranslationQaRun({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      createdByUserId: user.id,
    });
    if (!claimed.ok) throw new Error("expected claimed run");
    return { organization, project, runId: claimed.runId, keyId };
  }

  it("scores translated segments, flags those below the domain's threshold and summarises them", async () => {
    const { organization, project, runId, keyId } = await setUpEstimatedProject();
    const generate = scoringModel();
    const input = { runId, organizationId: organization.id, projectId: project.id };

    await expect(
      estimateTranslationQaQualityPage({ ...input, afterTranslationId: null, generate }),
    ).resolves.toEqual({ done: true });
    expect(generate).toHaveBeenCalledTimes(1);

    const estimates = await db
      .select({
        translationKeyId: schema.translationQualityEstimates.translationKeyId,
        score: schema.translationQualityEstimates.score,
        domain: schema.translationQualityEstimates.domain,
      })
      .from(schema.translationQualityEstimates)
      .where(eq(schema.translationQualityEstimates.projectId, project.id));
    expect(estimates).toHaveLength(2);
    expect(estimates.find((row) => row.translationKeyId === keyId("dose"))).toMatchObject({
      score: 30,
      domain: "legal",
    });

    const findings = await db
      .select({
        translationKeyId: schema.translationQaFindings.translationKeyId,
        checkType: schema.translationQaFindings.checkType,
        severity: schema.translationQaFindings.severity,
        message: schema.translationQaFindings.message,
      })
      .from(schema.translationQaFindings)
      .where(eq(schema.translationQaFindings.runId, runId));
    expect(findings).toEqual([
      {
        translationKeyId: keyId("dose"),
        checkType: "quality_estimate",
        severity: "error",
        message: "Estimated quality 30/100, below the threshold of 85. Dosage changed.",
      },
    ]);

    // A retried step reuses stored estimates and does not duplicate findings.
    const retry = scoringModel();
    await estimateTranslationQaQualityPage({ ...input, afterTranslationId: null, generate: retry });
    expect(retry).not.toHaveBeenCalled();
    const afterRetry = await db
      .select({ id: schema.translationQaFindings.id })
      .from(schema.translationQaFindings)
      .where(eq(schema.translationQaFindings.runId, runId));
    expect(afterRetry).toHaveLength(1);

    await completeTranslationQaScan(input);
    const [completed] = await db
      .select({
        summary: schema.translationQaRuns.summary,
        errorCount: schema.translationQaRuns.errorCount,
      })
      .from(schema.translationQaRuns)
      .where(eq(schema.translationQaRuns.id, runId));
    expect(completed?.errorCount).toBe(1);
    expect(completed?.summary.qualityDomain).toBe("legal");
    expect(completed?.summary.estimation).toEqual({
      threshold: 85,
      domain: "legal",
      segmentCount: 2,
      estimatedCount: 2,
      averageScore: 62.5,
      belowThresholdCount: 1,
      byLocale: {
        "de-DE": { segmentCount: 2, estimatedCount: 2, averageScore: 62.5, belowThresholdCount: 1 },
      },
    });
    expect(completed?.summary.quality?.byLocale["de-DE"]).toMatchObject({
      penaltyPoints: 5,
      passed: false,
    });
  });

  it("re-estimates a segment whose translation changed", async () => {
    const { organization, project, runId, keyId } = await setUpEstimatedProject();
    const input = { runId, organizationId: organization.id, projectId: project.id };
    await estimateTranslationQaQualityPage({
      ...input,
      afterTranslationId: null,
      generate: scoringModel(),
    });
    await db
      .update(schema.projectTranslations)
      .set({ text: "Nehmen Sie täglich 2 Tabletten" })
      .where(eq(schema.projectTranslations.translationKeyId, keyId("dose")));

    const generate = scoringModel();
    await estimateTranslationQaQualityPage({ ...input, afterTranslationId: null, generate });
    expect(generate).toHaveBeenCalledTimes(1);
    const prompt = vi.mocked(generate).mock.calls[0]![0].prompt;
    expect(prompt).toContain("2 Tabletten");
    expect(prompt).not.toContain("Speichern");
    const findings = await db
      .select({ id: schema.translationQaFindings.id })
      .from(schema.translationQaFindings)
      .where(eq(schema.translationQaFindings.runId, runId));
    expect(findings).toHaveLength(0);
  });

  it("marks the run incomplete when the estimator fails, and keeps older estimate findings open", async () => {
    const { organization, project, runId, keyId } = await setUpEstimatedProject();
    const input = { runId, organizationId: organization.id, projectId: project.id };
    const [olderRun] = await db
      .insert(schema.translationQaRuns)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        trigger: "manual",
        status: "succeeded",
        summary: emptyTranslationQaSummary(),
      })
      .returning({ id: schema.translationQaRuns.id });
    const [older] = await db
      .insert(schema.translationQaFindings)
      .values({
        runId: olderRun!.id,
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: keyId("dose"),
        key: "dose",
        targetLocale: "de-DE",
        checkType: "quality_estimate",
        severity: "error",
        category: "qa",
        message: "Estimated quality 30/100, below the threshold of 85. Dosage changed.",
        sourceText: "Take 2 tablets daily",
        targetText: "Nehmen Sie täglich 3 Tabletten",
      })
      .returning({ id: schema.translationQaFindings.id });

    const failing = vi.fn<QeGenerate>(async () => {
      throw new Error("model down");
    });
    await estimateTranslationQaQualityPage({
      ...input,
      afterTranslationId: null,
      generate: failing,
    });
    await completeTranslationQaScan(input);

    const [completed] = await db
      .select({ summary: schema.translationQaRuns.summary })
      .from(schema.translationQaRuns)
      .where(eq(schema.translationQaRuns.id, runId));
    expect(completed?.summary.estimationIncomplete).toBe(true);
    expect(completed?.summary.estimation).toMatchObject({ segmentCount: 2, estimatedCount: 0 });
    const [olderRow] = await db
      .select({ status: schema.translationQaFindings.status })
      .from(schema.translationQaFindings)
      .where(eq(schema.translationQaFindings.id, older!.id));
    expect(olderRow?.status).toBe("open");
  });

  it("does nothing when the check is off", async () => {
    const { organization, project, runId } = await setUpEstimatedProject();
    await db
      .update(schema.translationQaRuns)
      .set({ checkPolicy: DEFAULT_QA_POLICY })
      .where(eq(schema.translationQaRuns.id, runId));
    const generate = scoringModel();
    await expect(
      estimateTranslationQaQualityPage({
        runId,
        organizationId: organization.id,
        projectId: project.id,
        afterTranslationId: null,
        generate,
      }),
    ).resolves.toEqual({ done: true });
    expect(generate).not.toHaveBeenCalled();
  });
});
