/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ApiAuthContext } from "@/api/auth/workos";
import { encodeProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

const dbSelectMock = vi.fn();
const getTmsProviderLiveProjectMock = vi.fn();

vi.mock("@/lib/database", () => ({
  db: {
    select: dbSelectMock,
  },
  schema: {
    projects: {
      id: "id",
      organizationId: "organization_id",
      teamId: "team_id",
      source: "source",
    },
    teams: {
      id: "id",
      organizationId: "organization_id",
    },
    teamMemberships: {
      teamId: "team_id",
      userId: "user_id",
    },
    glossaries: {
      id: "id",
      organizationId: "organization_id",
    },
    memories: {
      id: "id",
      organizationId: "organization_id",
    },
  },
}));

vi.mock("@/lib/teams/default-workspace-team", () => ({
  backfillOrganizationProjectTeams: vi.fn(),
}));

vi.mock("@/lib/providers/jobs/tms-provider-live", () => ({
  getTmsProviderLiveProject: (...args: unknown[]) => getTmsProviderLiveProjectMock(...args),
}));

vi.mock("@/api/auth/policy", () => ({
  hasCapability: (role: string, capability: string) => {
    if (capability === "teams:write") {
      return role === "admin" || role === "localization_manager";
    }
    return true;
  },
}));

function createAuthContext(role: "admin" | "member" = "admin"): ApiAuthContext {
  const organization = {
    workosOrganizationId: "workos_org_1",
    localOrganizationId: "org_1",
    name: "Test Organization",
    slug: null,
    membership: {
      workosMembershipId: null,
      role,
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

/**
 * Chainable select mock that supports both:
 * - `.from().where().limit()` (project / backfill lookups)
 * - `.from().innerJoin().where()` (team membership lookups)
 *
 * Each `db.select()` consumes the next queued row set so tests can simulate
 * backfill → visible teams → team-scoped project lookup sequences.
 */
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

describe("canAccessGlossary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("rejects live provider glossary ids before database lookup", async () => {
    const { canAccessGlossary } = await import("./team-access");
    const result = await canAccessGlossary(createAuthContext(), "crowdin:glossary:718373");

    expect(result).toBeNull();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });
});

describe("canAccessMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("rejects live provider memory ids before database lookup", async () => {
    const { canAccessMemory } = await import("./team-access");
    const result = await canAccessMemory(createAuthContext(), "smartling:tm:tm-42");

    expect(result).toBeNull();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });
});

describe("canAccessProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("allows live-only external TMS projects when no local projects row exists", async () => {
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "902807",
    });

    // backfill check → no visible teams → team-scoped project miss
    mockSelectQueue([[], [], []]);
    getTmsProviderLiveProjectMock.mockResolvedValueOnce({
      id: projectId,
      name: "HL-Test",
    });

    const { canAccessProject } = await import("./team-access");
    const result = await canAccessProject(createAuthContext("member"), projectId);

    expect(getTmsProviderLiveProjectMock).toHaveBeenCalledWith("org_1", "902807", {
      actorUserId: "user_1",
    });
    expect(result).toEqual({ id: projectId });
  });

  it("allows live external TMS projects even when materialized outside the member's teams", async () => {
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "902807",
    });

    // Member belongs to a team, but the team-scoped project query still misses
    // (materialized row lives on another team). Live TMS must authorize instead.
    mockSelectQueue([
      [], // backfill: no null-team projects
      [{ id: "team_alpha" }], // visible teams for the member
      [], // team-scoped ownedProjectWhere filters the project out
    ]);
    getTmsProviderLiveProjectMock.mockResolvedValueOnce({
      id: projectId,
      name: "HL-Test",
    });

    const { canAccessProject } = await import("./team-access");
    const result = await canAccessProject(createAuthContext("member"), projectId);

    expect(dbSelectMock).toHaveBeenCalledTimes(3);
    expect(getTmsProviderLiveProjectMock).toHaveBeenCalledWith("org_1", "902807", {
      actorUserId: "user_1",
    });
    expect(result).toEqual({ id: projectId });
  });

  it("denies external TMS projects the live provider does not return", async () => {
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "902807",
    });

    mockSelectQueue([[], [], []]);
    getTmsProviderLiveProjectMock.mockResolvedValueOnce(null);

    const { canAccessProject } = await import("./team-access");
    const result = await canAccessProject(createAuthContext("member"), projectId);

    expect(result).toBeNull();
  });
});
