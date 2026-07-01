import { describe, expect, it, vi } from "vite-plus/test";

import { encodeProviderProjectId } from "@/lib/providers/tms-provider-resource-id";

const getTmsProviderLiveProjectMock = vi.fn();

vi.mock("@/lib/database", () => ({
  schema: {
    interactions: {
      id: "id",
      organizationId: "organization_id",
    },
    inboxItems: {
      interactionId: "interaction_id",
      organizationId: "organization_id",
    },
    projects: {
      id: "id",
      name: "name",
    },
  },
}));

vi.mock("@/lib/providers/tms-provider-live", () => ({
  getTmsProviderLiveProject: (...args: unknown[]) => getTmsProviderLiveProjectMock(...args),
}));

vi.mock("@/lib/tools/tool-access", () => ({
  toolCanAccessProject: vi.fn(async () => ({ id: "ext:crowdin:902807" })),
}));

vi.mock("@/lib/tools/list-agent-projects", () => ({
  listAgentProjects: vi.fn(),
}));

describe("createUpdateInteractionProjectTool", () => {
  it("attaches live external TMS projects without materializing a local projects row", async () => {
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "902807",
    });
    const update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    }));

    getTmsProviderLiveProjectMock.mockResolvedValueOnce({
      id: projectId,
      name: "HL-Test",
    });

    const { createUpdateInteractionProjectTool } = await import("./project-tools");
    const tool = createUpdateInteractionProjectTool({
      conversationId: "conv_1",
      organizationId: "org_1",
      localUserId: "user_1",
      membershipRole: "member",
      projectId: null,
      db: {
        update,
        select: vi.fn(),
      },
    } as never);

    const result = await tool.execute?.({ projectId }, {} as never);

    expect(getTmsProviderLiveProjectMock).toHaveBeenCalledWith("org_1", "902807", {
      actorUserId: "user_1",
    });
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.results[0]?.value.set).toHaveBeenCalledWith(
      expect.objectContaining({ projectId }),
    );
    expect(result).toEqual({
      success: true,
      project: {
        id: projectId,
        name: "HL-Test",
      },
    });
  });
});
