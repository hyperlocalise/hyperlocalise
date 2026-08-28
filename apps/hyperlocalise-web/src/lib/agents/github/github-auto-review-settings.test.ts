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
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database/client";
import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  getGithubAutoReviewSettings,
  isGithubAutoReviewEnabledForRepository,
  upsertGithubAutoReviewSettings,
} from "./github-auto-review-settings";

const organizationIds: string[] = [];

async function seedOrganizationWithRepository(input?: { enabled?: boolean; archived?: boolean }) {
  const organizationId = crypto.randomUUID();
  const numericSuffix = BigInt(`0x${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`)
    .toString()
    .slice(0, 12);
  const githubInstallationId = `7${numericSuffix}`;
  const githubRepositoryId = `6${numericSuffix}`;
  organizationIds.push(organizationId);

  await db.insert(schema.organizations).values({
    id: organizationId,
    workosOrganizationId: `org_${organizationId}`,
    slug: `auto-review-${organizationId.slice(0, 8)}`,
    name: "Auto-review Test Org",
  });

  await db.insert(schema.githubInstallations).values({
    organizationId,
    githubInstallationId,
    githubAppId: "123",
    accountLogin: "hyperlocalise",
    accountType: "Organization",
  });

  const [repository] = await db
    .insert(schema.githubInstallationRepositories)
    .values({
      organizationId,
      githubInstallationId,
      githubRepositoryId,
      owner: "hyperlocalise",
      name: `web-${numericSuffix}`,
      fullName: `hyperlocalise/web-${numericSuffix}`,
      private: false,
      archived: input?.archived ?? false,
      defaultBranch: "main",
      enabled: input?.enabled ?? true,
    })
    .returning();

  if (!repository) {
    throw new Error("failed to seed github installation repository");
  }

  return { organizationId, repository };
}

describe("github auto-review settings", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    for (const organizationId of organizationIds.splice(0)) {
      await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    }
  });

  it("returns off by default with no selected repositories", async () => {
    const { organizationId, repository } = await seedOrganizationWithRepository();

    await expect(getGithubAutoReviewSettings(organizationId)).resolves.toMatchObject({
      enabled: false,
      additionalPrompt: "",
      githubInstallationRepositoryIds: [],
      repositories: [expect.objectContaining({ id: repository.id })],
    });
    await expect(
      isGithubAutoReviewEnabledForRepository({
        organizationId,
        githubInstallationRepositoryId: repository.id,
      }),
    ).resolves.toBe(false);
  });

  it("upserts settings and repository selection", async () => {
    const { organizationId, repository } = await seedOrganizationWithRepository();

    const result = await upsertGithubAutoReviewSettings({
      organizationId,
      enabled: true,
      additionalPrompt: "Focus on ICU.",
      githubInstallationRepositoryIds: [repository.id],
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      return;
    }
    expect(result.value).toMatchObject({
      enabled: true,
      additionalPrompt: "Focus on ICU.",
      githubInstallationRepositoryIds: [repository.id],
    });
    await expect(
      isGithubAutoReviewEnabledForRepository({
        organizationId,
        githubInstallationRepositoryId: repository.id,
      }),
    ).resolves.toBe(true);
  });

  it("rejects disabled and archived repositories", async () => {
    const disabled = await seedOrganizationWithRepository({ enabled: false });
    const disabledResult = await upsertGithubAutoReviewSettings({
      organizationId: disabled.organizationId,
      enabled: true,
      additionalPrompt: "",
      githubInstallationRepositoryIds: [disabled.repository.id],
    });
    expect(isErr(disabledResult)).toBe(true);
    if (isErr(disabledResult)) {
      expect(disabledResult.error).toEqual({ code: "github_repository_not_enabled" });
    }

    const archived = await seedOrganizationWithRepository({ archived: true });
    const archivedResult = await upsertGithubAutoReviewSettings({
      organizationId: archived.organizationId,
      enabled: true,
      additionalPrompt: "",
      githubInstallationRepositoryIds: [archived.repository.id],
    });
    expect(isErr(archivedResult)).toBe(true);
    if (isErr(archivedResult)) {
      expect(archivedResult.error).toEqual({ code: "github_repository_archived" });
    }
  });
});
