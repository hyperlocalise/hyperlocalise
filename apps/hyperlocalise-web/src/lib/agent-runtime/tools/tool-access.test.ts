import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { encodeProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

const ownedProjectWhereMock = vi.fn(async () => ({}));
const getTmsProviderLiveProjectMock = vi.fn();

vi.mock("@/api/auth/team-access", () => ({
  ownedProjectWhere: ownedProjectWhereMock,
  buildAccessibleProjectsWhere: vi.fn(),
  buildAccessibleJobsWhere: vi.fn(),
  buildProjectLinkedGlossaryWhere: vi.fn(),
  buildProjectLinkedMemoryWhere: vi.fn(),
  canAccessGlossary: vi.fn(),
  canAccessMemory: vi.fn(),
  canAccessStoredFile: vi.fn(),
}));

vi.mock("@/lib/providers/jobs/tms-provider-live", () => ({
  getTmsProviderLiveProject: getTmsProviderLiveProjectMock,
}));

vi.mock("@/lib/database", () => ({
  schema: {
    projects: {
      id: "id",
      organizationId: "organization_id",
    },
    glossaries: { id: "id", organizationId: "organization_id" },
    memories: { id: "id", organizationId: "organization_id" },
  },
}));

function createDbSelectMock(results: Array<Array<{ id: string }>>) {
  let callIndex = 0;

  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => results[callIndex++] ?? []),
        })),
      })),
    })),
  };
}

describe("toolCanAccessProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("allows live-only external TMS projects when no local projects row exists", async () => {
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "902807",
    });

    getTmsProviderLiveProjectMock.mockResolvedValueOnce({
      id: projectId,
      name: "HL-Test",
    });

    const { toolCanAccessProject } = await import("./tool-access");
    const result = await toolCanAccessProject(
      {
        conversationId: "conv_1",
        organizationId: "org_1",
        localUserId: "user_1",
        membershipRole: "member",
        projectId: null,
        db: createDbSelectMock([[], []]),
      } as never,
      projectId,
    );

    expect(getTmsProviderLiveProjectMock).toHaveBeenCalledWith("org_1", "902807", {
      actorUserId: "user_1",
    });
    expect(result).toEqual({ id: projectId });
  });

  it("denies live external TMS projects that are materialized outside the member's teams", async () => {
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "902807",
    });

    const { toolCanAccessProject } = await import("./tool-access");
    const result = await toolCanAccessProject(
      {
        conversationId: "conv_1",
        organizationId: "org_1",
        localUserId: "user_1",
        membershipRole: "member",
        projectId: null,
        db: createDbSelectMock([[], [{ id: projectId }]]),
      } as never,
      projectId,
    );

    expect(getTmsProviderLiveProjectMock).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});

describe("toolGetAccessibleGlossary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("does not treat live provider glossary ids as stored glossary ids", async () => {
    const db = {
      select: vi.fn(() => {
        throw new Error("live provider glossary ids must not hit the database");
      }),
    };

    const { toolGetAccessibleGlossary } = await import("./tool-access");
    const result = await toolGetAccessibleGlossary(
      {
        conversationId: "conv_1",
        organizationId: "org_1",
        localUserId: "user_1",
        membershipRole: "member",
        projectId: null,
        db,
      } as never,
      "crowdin:glossary:718373",
    );

    expect(result).toBeNull();
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("toolGetAccessibleMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("does not treat live provider memory ids as stored memory ids", async () => {
    const db = {
      select: vi.fn(() => {
        throw new Error("live provider memory ids must not hit the database");
      }),
    };

    const { toolGetAccessibleMemory } = await import("./tool-access");
    const result = await toolGetAccessibleMemory(
      {
        conversationId: "conv_1",
        organizationId: "org_1",
        localUserId: "user_1",
        membershipRole: "member",
        projectId: null,
        db,
      } as never,
      "smartling:tm:tm-42",
    );

    expect(result).toBeNull();
    expect(db.select).not.toHaveBeenCalled();
  });
});
