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

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { emptyTranslationQaSummary } from "@/lib/qa/qa-report-store";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import { loadLinearQaFindings } from "./qa-finding-issues";

const authFixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await authFixture.cleanup();
});

async function insertProject(input: { organizationId: string; userId: string; teamId: string }) {
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      identifier: uniqueTestProjectIdentifier(),
      organizationId: input.organizationId,
      teamId: input.teamId,
      createdByUserId: input.userId,
      name: "Linear QA",
      description: "",
      translationContext: "",
      source: "native",
      sourceLocale: "en-US",
      targetLocales: ["de-DE"],
      qaScanCadence: "off",
    })
    .returning();
  return project!;
}

async function insertFinding(input: {
  organizationId: string;
  projectId: string;
  userId: string;
  key: string;
  status?: "open" | "ignored" | "resolved";
}) {
  const [run] = await db
    .insert(schema.translationQaRuns)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      trigger: "manual",
      status: "succeeded",
      createdByUserId: input.userId,
      summary: emptyTranslationQaSummary(),
      completedAt: new Date(),
    })
    .returning({ id: schema.translationQaRuns.id });

  const [finding] = await db
    .insert(schema.translationQaFindings)
    .values({
      runId: run!.id,
      organizationId: input.organizationId,
      projectId: input.projectId,
      key: input.key,
      targetLocale: "de-DE",
      checkType: "placeholder",
      severity: "error",
      category: "qa",
      status: input.status ?? "open",
      message: `${input.key} is missing a placeholder.`,
      sourceText: "Hello {name}",
      targetText: "Hallo",
    })
    .returning({ id: schema.translationQaFindings.id });

  return finding!.id;
}

describe("loadLinearQaFindings", () => {
  it("returns only open findings that belong to the requested organization", async () => {
    const home = await authFixture.createLocalWorkosIdentity();
    const foreign = await authFixture.createLocalWorkosIdentity();
    const homeTeam = await ensureDefaultWorkspaceTeam(home.organization.id);
    const foreignTeam = await ensureDefaultWorkspaceTeam(foreign.organization.id);
    const homeProject = await insertProject({
      organizationId: home.organization.id,
      userId: home.user.id,
      teamId: homeTeam.id,
    });
    const foreignProject = await insertProject({
      organizationId: foreign.organization.id,
      userId: foreign.user.id,
      teamId: foreignTeam.id,
    });

    const openId = await insertFinding({
      organizationId: home.organization.id,
      projectId: homeProject.id,
      userId: home.user.id,
      key: "open.key",
    });
    const ignoredId = await insertFinding({
      organizationId: home.organization.id,
      projectId: homeProject.id,
      userId: home.user.id,
      key: "ignored.key",
      status: "ignored",
    });
    const resolvedId = await insertFinding({
      organizationId: home.organization.id,
      projectId: homeProject.id,
      userId: home.user.id,
      key: "resolved.key",
      status: "resolved",
    });
    const foreignId = await insertFinding({
      organizationId: foreign.organization.id,
      projectId: foreignProject.id,
      userId: foreign.user.id,
      key: "foreign.key",
    });

    const findings = await loadLinearQaFindings({
      organizationId: home.organization.id,
      findingIds: [openId, ignoredId, resolvedId, foreignId],
    });

    expect(findings.map((finding) => finding.id)).toEqual([openId]);
    expect(findings[0]).toMatchObject({
      projectId: homeProject.id,
      projectName: "Linear QA",
      key: "open.key",
      targetLocale: "de-DE",
      checkType: "placeholder",
      severity: "error",
      message: "open.key is missing a placeholder.",
      sourceText: "Hello {name}",
      targetText: "Hallo",
    });
  });

  it("returns no rows for an empty id list", async () => {
    const { organization } = await authFixture.createLocalWorkosIdentity();
    await expect(
      loadLinearQaFindings({ organizationId: organization.id, findingIds: [] }),
    ).resolves.toEqual([]);
  });
});
