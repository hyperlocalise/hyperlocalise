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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/hyperlocalise_test";
});

import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { DEFAULT_WORKSPACE_TEAM_SLUG } from "@/lib/teams/default-workspace-team-constants";

import {
  hasAttachedGlossarySourceLocaleConflict,
  listAttachedTeamGlossaries,
  listContributorTeams,
} from "./attached-team-glossaries";

const createdOrganizationIds = new Set<string>();
const createdUserIds = new Set<string>();

afterEach(async () => {
  for (const organizationId of createdOrganizationIds) {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
  }
  createdOrganizationIds.clear();

  for (const userId of createdUserIds) {
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  }
  createdUserIds.clear();
});

async function createOrganization() {
  const suffix = randomUUID();
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      workosOrganizationId: `org_${suffix}`,
      name: `Attached Glossary Org ${suffix}`,
      slug: `attached-glossary-org-${suffix}`,
    })
    .returning();
  createdOrganizationIds.add(organization.id);
  return organization;
}

async function createUser() {
  const suffix = randomUUID();
  const [user] = await db
    .insert(schema.users)
    .values({
      workosUserId: `user_${suffix}`,
      email: `attached-${suffix}@example.com`,
    })
    .returning();
  createdUserIds.add(user.id);
  return user;
}

async function createTeam(organizationId: string, slug: string, name: string) {
  const [team] = await db
    .insert(schema.teams)
    .values({
      organizationId,
      slug,
      name,
    })
    .returning();
  return team;
}

async function createProject(input: {
  organizationId: string;
  teamId: string;
  sourceLocale?: string;
}) {
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      identifier: uniqueTestProjectIdentifier(),
      organizationId: input.organizationId,
      teamId: input.teamId,
      name: "CAT Project",
      description: "",
      translationContext: "",
      sourceLocale: input.sourceLocale ?? "en",
    })
    .returning();
  return project;
}

async function attachGlossary(input: {
  organizationId: string;
  projectId: string;
  name: string;
  controlLevel: "org" | "team";
  teamId?: string | null;
  sourceLocale?: string;
  status?: "active" | "archived" | "draft";
  source?: "native" | "external_tms";
  priority?: number;
}) {
  const [glossary] = await db
    .insert(schema.glossaries)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      description: "",
      sourceLocale: input.sourceLocale ?? "en",
      targetLocale: null,
      status: input.status ?? "active",
      source: input.source ?? "native",
      controlLevel: input.controlLevel,
      teamId: input.teamId ?? null,
      ...(input.source === "external_tms"
        ? {
            externalProviderKind: "crowdin" as const,
            externalGlossaryId: `ext_${randomUUID()}`,
          }
        : {}),
    })
    .returning();

  await db.insert(schema.projectGlossaries).values({
    organizationId: input.organizationId,
    projectId: input.projectId,
    glossaryId: glossary.id,
    priority: input.priority ?? 0,
  });

  return glossary;
}

describe("listAttachedTeamGlossaries", () => {
  it("keeps only active native team glossaries matching the project source locale", async () => {
    const organization = await createOrganization();
    const team = await createTeam(organization.id, "alpha", "Alpha");
    const project = await createProject({
      organizationId: organization.id,
      teamId: team.id,
      sourceLocale: "en",
    });

    const matching = await attachGlossary({
      organizationId: organization.id,
      projectId: project.id,
      name: "Team Match",
      controlLevel: "team",
      teamId: team.id,
      priority: 2,
    });
    await attachGlossary({
      organizationId: organization.id,
      projectId: project.id,
      name: "Org Control",
      controlLevel: "org",
      priority: 1,
    });
    await attachGlossary({
      organizationId: organization.id,
      projectId: project.id,
      name: "Archived Team",
      controlLevel: "team",
      teamId: team.id,
      status: "archived",
    });
    await attachGlossary({
      organizationId: organization.id,
      projectId: project.id,
      name: "Wrong Locale",
      controlLevel: "team",
      teamId: team.id,
      sourceLocale: "de",
    });
    await attachGlossary({
      organizationId: organization.id,
      projectId: project.id,
      name: "Crowdin Team-shaped",
      controlLevel: "org",
      source: "external_tms",
    });
    // Team control without teamId must be dropped by the flatMap guard.
    await attachGlossary({
      organizationId: organization.id,
      projectId: project.id,
      name: "Team Without Owner",
      controlLevel: "team",
      teamId: null,
    });

    const attached = await listAttachedTeamGlossaries(project.id);
    expect(attached).toEqual([{ id: matching.id, name: "Team Match", teamId: team.id }]);
  });
});

describe("listContributorTeams", () => {
  it("returns membership teams, or all non-default teams for org-wide access", async () => {
    const organization = await createOrganization();
    const user = await createUser();
    const defaultTeam = await createTeam(
      organization.id,
      DEFAULT_WORKSPACE_TEAM_SLUG,
      "Default team",
    );
    const alpha = await createTeam(organization.id, "alpha", "Alpha");
    const beta = await createTeam(organization.id, "beta", "Beta");

    await db.insert(schema.teamMemberships).values({
      teamId: alpha.id,
      userId: user.id,
      role: "member",
    });

    const membershipOnly = await listContributorTeams(user.id, organization.id);
    expect(membershipOnly).toEqual([{ id: alpha.id, name: "Alpha", slug: "alpha" }]);

    const orgWide = await listContributorTeams(user.id, organization.id, {
      organizationWideAccess: true,
    });
    expect(orgWide).toEqual([
      { id: alpha.id, name: "Alpha", slug: "alpha" },
      { id: beta.id, name: "Beta", slug: "beta" },
    ]);
    expect(orgWide.some((team) => team.id === defaultTeam.id)).toBe(false);
  });
});

describe("hasAttachedGlossarySourceLocaleConflict", () => {
  it("detects attached glossaries whose source locale differs from the candidate", async () => {
    const organization = await createOrganization();
    const team = await createTeam(organization.id, "alpha", "Alpha");
    const project = await createProject({
      organizationId: organization.id,
      teamId: team.id,
      sourceLocale: "en",
    });

    expect(await hasAttachedGlossarySourceLocaleConflict(project.id, "en")).toBe(false);

    await attachGlossary({
      organizationId: organization.id,
      projectId: project.id,
      name: "German Source",
      controlLevel: "org",
      sourceLocale: "de",
    });

    expect(await hasAttachedGlossarySourceLocaleConflict(project.id, "en")).toBe(true);
    expect(await hasAttachedGlossarySourceLocaleConflict(project.id, "de")).toBe(false);
  });
});
