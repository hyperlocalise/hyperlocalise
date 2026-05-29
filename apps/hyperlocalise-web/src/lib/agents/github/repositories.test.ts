import "dotenv/config";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import {
  deleteOrganizationGitHubInstallationRepositories,
  upsertGitHubInstallationRepositories,
} from "./repositories";

describe("deleteOrganizationGitHubInstallationRepositories", () => {
  const organizationId = crypto.randomUUID();
  const currentInstallationId = "910001";
  const staleInstallationId = "910002";

  afterEach(async () => {
    await db
      .delete(schema.githubInstallationRepositories)
      .where(eq(schema.githubInstallationRepositories.organizationId, organizationId));
    await db
      .delete(schema.githubInstallations)
      .where(eq(schema.githubInstallations.organizationId, organizationId));
    await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
  });

  it("removes repository rows for a replaced installation id", async () => {
    await db.insert(schema.organizations).values({
      id: organizationId,
      workosOrganizationId: `org_${organizationId}`,
      slug: `org-${organizationId.slice(0, 8)}`,
      name: "Acme",
    });

    await db.insert(schema.githubInstallations).values({
      organizationId,
      githubInstallationId: currentInstallationId,
      githubAppId: "1",
      accountLogin: "acme",
      accountType: "Organization",
    });

    await upsertGitHubInstallationRepositories({
      organizationId,
      githubInstallationId: staleInstallationId,
      repositories: [
        {
          id: "920001",
          owner: "acme",
          name: "legacy",
          fullName: "acme/legacy",
          private: false,
          archived: false,
          defaultBranch: "main",
        },
      ],
    });

    await upsertGitHubInstallationRepositories({
      organizationId,
      githubInstallationId: currentInstallationId,
      repositories: [
        {
          id: "920002",
          owner: "acme",
          name: "current",
          fullName: "acme/current",
          private: false,
          archived: false,
          defaultBranch: "main",
        },
      ],
    });

    await deleteOrganizationGitHubInstallationRepositories({
      organizationId,
      githubInstallationId: staleInstallationId,
    });

    const remaining = await db
      .select({
        githubInstallationId: schema.githubInstallationRepositories.githubInstallationId,
        fullName: schema.githubInstallationRepositories.fullName,
      })
      .from(schema.githubInstallationRepositories)
      .where(eq(schema.githubInstallationRepositories.organizationId, organizationId));

    expect(remaining).toEqual([
      {
        githubInstallationId: currentInstallationId,
        fullName: "acme/current",
      },
    ]);
  });

  it("does not delete repositories for another organization", async () => {
    const otherOrganizationId = crypto.randomUUID();

    try {
      await db.insert(schema.organizations).values({
        id: otherOrganizationId,
        workosOrganizationId: `org_${otherOrganizationId}`,
        slug: `org-${otherOrganizationId.slice(0, 8)}`,
        name: "Other Org",
      });

      await upsertGitHubInstallationRepositories({
        organizationId: otherOrganizationId,
        githubInstallationId: staleInstallationId,
        repositories: [
          {
            id: "920003",
            owner: "acme",
            name: "other",
            fullName: "acme/other",
            private: false,
            archived: false,
            defaultBranch: "main",
          },
        ],
      });

      await deleteOrganizationGitHubInstallationRepositories({
        organizationId,
        githubInstallationId: staleInstallationId,
      });

      const otherOrgRows = await db
        .select({ id: schema.githubInstallationRepositories.id })
        .from(schema.githubInstallationRepositories)
        .where(
          and(
            eq(schema.githubInstallationRepositories.organizationId, otherOrganizationId),
            eq(schema.githubInstallationRepositories.githubInstallationId, staleInstallationId),
          ),
        );

      expect(otherOrgRows).toHaveLength(1);
    } finally {
      await db
        .delete(schema.githubInstallationRepositories)
        .where(eq(schema.githubInstallationRepositories.organizationId, otherOrganizationId));
      await db.delete(schema.organizations).where(eq(schema.organizations.id, otherOrganizationId));
    }
  });
});
