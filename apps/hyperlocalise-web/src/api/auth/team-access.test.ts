import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ApiAuthContext } from "@/api/auth/workos";

const dbSelectMock = vi.fn();

vi.mock("@/lib/database", () => ({
  db: {
    select: dbSelectMock,
  },
  schema: {
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

function createAuthContext(): ApiAuthContext {
  const organization = {
    workosOrganizationId: "workos_org_1",
    localOrganizationId: "org_1",
    name: "Test Organization",
    slug: null,
    membership: {
      workosMembershipId: null,
      role: "admin",
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
