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
import { beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import { runDueTranslationQaScans } from "./schedule-due-qa-scans";

const authFixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

describe("schedule due translation QA scans", () => {
  it("schedules daily scans for native projects and ignores provider projects", async () => {
    const { organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);

    const [nativeProject] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        identifier: uniqueTestProjectIdentifier(),
        organizationId: organization.id,
        teamId: team.id,
        createdByUserId: user.id,
        name: "Native",
        description: "",
        translationContext: "",
        source: "native",
        sourceLocale: "en-US",
        targetLocales: ["de-DE"],
        qaScanCadence: "daily",
      })
      .returning();

    const [providerProject] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        identifier: uniqueTestProjectIdentifier(),
        organizationId: organization.id,
        teamId: team.id,
        createdByUserId: user.id,
        name: "Phrase Catalog",
        description: "",
        translationContext: "",
        source: "external_tms",
        externalProviderKind: "phrase",
        externalProjectId: "42",
        sourceLocale: "en-US",
        targetLocales: ["de-DE"],
        qaScanCadence: "daily",
      })
      .returning();

    const result = await runDueTranslationQaScans({ limit: 50 });
    expect(result.succeeded).toBeGreaterThanOrEqual(1);

    const nativeRuns = await db
      .select({ id: schema.translationQaRuns.id })
      .from(schema.translationQaRuns)
      .where(eq(schema.translationQaRuns.projectId, nativeProject!.id));
    const providerRuns = await db
      .select({ id: schema.translationQaRuns.id })
      .from(schema.translationQaRuns)
      .where(eq(schema.translationQaRuns.projectId, providerProject!.id));

    expect(nativeRuns).toHaveLength(1);
    expect(providerRuns).toHaveLength(0);
  });
});
