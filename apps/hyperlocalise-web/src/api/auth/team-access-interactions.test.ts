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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ApiAuthContext } from "@/api/auth/workos";
import type { SQL } from "drizzle-orm";

const dbSelectMock = vi.fn();

vi.mock("@/lib/database/client", () => ({
  db: {
    select: dbSelectMock,
  },
  schema: {
    projects: {
      id: "projects.id",
      organizationId: "projects.organization_id",
      teamId: "projects.team_id",
      source: "projects.source",
    },
    teams: {
      id: "teams.id",
      organizationId: "teams.organization_id",
    },
    teamMemberships: {
      teamId: "team_memberships.team_id",
      userId: "team_memberships.user_id",
    },
    glossaries: {
      id: "glossaries.id",
      organizationId: "glossaries.organization_id",
    },
    memories: {
      id: "memories.id",
      organizationId: "memories.organization_id",
    },
    interactions: {
      id: "interactions.id",
      organizationId: "interactions.organization_id",
      projectId: "interactions.project_id",
      source: "interactions.source",
    },
    interactionMessages: {
      id: "interaction_messages.id",
      interactionId: "interaction_messages.interaction_id",
      senderType: "interaction_messages.sender_type",
      senderEmail: "interaction_messages.sender_email",
    },
    jobs: {
      id: "jobs.id",
      organizationId: "jobs.organization_id",
      projectId: "jobs.project_id",
    },
    projectGlossaries: {
      glossaryId: "project_glossaries.glossary_id",
      projectId: "project_glossaries.project_id",
    },
    projectMemories: {
      memoryId: "project_memories.memory_id",
      projectId: "project_memories.project_id",
    },
  },
}));

vi.mock("@/lib/teams/default-workspace-team", () => ({
  backfillOrganizationProjectTeams: vi.fn(),
}));

vi.mock("@/lib/providers/jobs/tms-provider-live", () => ({
  getTmsProviderLiveProject: vi.fn(),
}));

vi.mock("@/api/auth/policy", () => ({
  hasCapability: (role: string, capability: string) => {
    if (capability === "teams:write") {
      return role === "admin" || role === "localization_manager";
    }
    return true;
  },
}));

function createMemberAuthContext(): ApiAuthContext {
  const organization = {
    workosOrganizationId: "workos_org_1",
    localOrganizationId: "org_1",
    name: "Test Organization",
    slug: null,
    membership: {
      workosMembershipId: null,
      role: "member" as const,
      accessSource: "direct",
    },
  };

  return {
    user: {
      workosUserId: "workos_user_1",
      localUserId: "user_1",
      email: "user@example.com",
    },
    organizations: [organization],
    organization,
    activeOrganization: organization,
    membership: organization.membership,
    activeTeam: null,
    capabilities: [],
  } as ApiAuthContext;
}

function mockSelectQueue(rowSets: unknown[][]) {
  let callIndex = 0;
  dbSelectMock.mockImplementation(() => {
    const rows = rowSets[callIndex++] ?? [];
    const builder = Promise.resolve(rows) as Promise<unknown[]> & {
      from: ReturnType<typeof vi.fn>;
      innerJoin: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
    };
    builder.from = vi.fn(() => builder);
    builder.innerJoin = vi.fn(() => builder);
    builder.where = vi.fn(() => builder);
    builder.limit = vi.fn(async () => rows);
    return builder;
  });
}

function sqlBlob(value: SQL): string {
  return JSON.stringify(value);
}

describe("buildAccessibleInteractionsWhere", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("keeps authored chat_ui threads on ext: project ids visible to team-scoped members", async () => {
    // getAccessibleProjectIds → no local projects for this member
    mockSelectQueue([[]]);

    const { buildAccessibleInteractionsWhere } = await import("./team-access");
    const where = await buildAccessibleInteractionsWhere(createMemberAuthContext());
    const blob = sqlBlob(where);

    expect(blob).toContain("chat_ui");
    expect(blob).toContain("ext:%");
    // Author filter is an EXISTS subquery on interaction_messages; with the mocked
    // db.select builder the subquery chunk is opaque, but the outer ownership gate
    // (chat_ui + null/ext projectId) is what #1673 relies on for live TMS chats.
    expect(blob).toContain("exists ");
  });

  it("still allows authored unscoped chat_ui threads for team-scoped members", async () => {
    mockSelectQueue([[]]);

    const { buildAccessibleInteractionsWhere } = await import("./team-access");
    const where = await buildAccessibleInteractionsWhere(createMemberAuthContext());
    const blob = sqlBlob(where);

    // Null projectId branch is part of the owned-workspace filter OR.
    expect(blob).toMatch(/null|IS NULL|isNull/i);
    expect(blob).toContain("chat_ui");
  });

  it("returns organization-wide scope for operators with teams:write", async () => {
    const auth = createMemberAuthContext();
    auth.membership.role = "admin";
    auth.organization.membership.role = "admin";
    auth.activeOrganization.membership.role = "admin";

    const { buildAccessibleInteractionsWhere } = await import("./team-access");
    const where = await buildAccessibleInteractionsWhere(auth);
    const blob = sqlBlob(where);

    expect(blob).not.toContain("ext:%");
    expect(blob).not.toContain("chat_ui");
    expect(dbSelectMock).not.toHaveBeenCalled();
  });
});
