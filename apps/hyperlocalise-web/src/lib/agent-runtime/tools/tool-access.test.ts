import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { encodeProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

const canAccessProjectMock = vi.fn();

vi.mock("@/api/auth/team-access", () => ({
  canAccessProject: canAccessProjectMock,
  ownedProjectWhere: vi.fn(),
  buildAccessibleProjectsWhere: vi.fn(),
  buildAccessibleJobsWhere: vi.fn(),
  buildProjectLinkedGlossaryWhere: vi.fn(),
  buildProjectLinkedMemoryWhere: vi.fn(),
  canAccessGlossary: vi.fn(),
  canAccessMemory: vi.fn(),
  canAccessStoredFile: vi.fn(),
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

describe("toolCanAccessProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("delegates project access to canAccessProject, including live TMS fallback", async () => {
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "902807",
    });

    canAccessProjectMock.mockResolvedValueOnce({ id: projectId });

    const { toolCanAccessProject } = await import("./tool-access");
    const result = await toolCanAccessProject(
      {
        conversationId: "conv_1",
        organizationId: "org_1",
        localUserId: "user_1",
        membershipRole: "member",
        projectId: null,
        db: {},
      } as never,
      projectId,
    );

    expect(canAccessProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ localUserId: "user_1" }),
        organization: expect.objectContaining({ localOrganizationId: "org_1" }),
        membership: expect.objectContaining({ role: "member" }),
      }),
      projectId,
    );
    expect(result).toEqual({ id: projectId });
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
