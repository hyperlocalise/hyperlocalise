import { describe, expect, it, vi } from "vite-plus/test";

import { ok } from "@/lib/primitives/result/results";
import { encodeProviderProjectId } from "@/lib/providers/tms-provider-resource-id";

const ensureOrganizationProjectRecordMock = vi.fn();

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

vi.mock("@/lib/projects/organization/organization-project-service", () => ({
  ensureOrganizationProjectRecord: (...args: unknown[]) =>
    ensureOrganizationProjectRecordMock(...args),
}));

vi.mock("@/lib/tools/tool-access", () => ({
  toolCanAccessProject: vi.fn(async () => ({ id: "ext:crowdin:902807" })),
}));

vi.mock("@/lib/tools/list-agent-projects", () => ({
  listAgentProjects: vi.fn(),
}));

describe("createUpdateInteractionProjectTool", () => {
  it("materializes live external projects before attaching the interaction", async () => {
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "902807",
    });
    const ensuredProjectId = projectId;
    const update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    }));
    const select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ id: ensuredProjectId, name: "HL-Test" }]),
        })),
      })),
    }));

    ensureOrganizationProjectRecordMock.mockResolvedValueOnce(ok(ensuredProjectId));

    const { createUpdateInteractionProjectTool } = await import("./project-tools");
    const tool = createUpdateInteractionProjectTool({
      conversationId: "conv_1",
      organizationId: "org_1",
      localUserId: "user_1",
      membershipRole: "member",
      projectId: null,
      db: {
        update,
        select,
      },
    } as never);

    const result = await tool.execute?.({ projectId }, {} as never);

    expect(ensureOrganizationProjectRecordMock).toHaveBeenCalledWith({
      organizationId: "org_1",
      projectId,
      userId: "user_1",
    });
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.results[0]?.value.set).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: ensuredProjectId }),
    );
    expect(result).toEqual({
      success: true,
      project: {
        id: ensuredProjectId,
        name: "HL-Test",
      },
    });
  });
});
