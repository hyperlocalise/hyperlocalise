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
import { beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";
import type { TranslationQaScanQueue } from "@/lib/workflow/types";

import { emptyTranslationQaSummary } from "./qa-report-store";
import {
  claimTranslationQaRun,
  completeTranslationQaScan,
  reclaimStaleTranslationQaRuns,
  startTranslationQaScan,
  STALE_RUNNING_SCAN_MS,
} from "./run-project-qa-scan";

const authFixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
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
    const queue = { enqueue: vi.fn() } as unknown as TranslationQaScanQueue;

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

    expect(queue.enqueue).not.toHaveBeenCalled();
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
});
