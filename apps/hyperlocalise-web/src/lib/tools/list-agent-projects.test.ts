import { describe, expect, it, vi } from "vite-plus/test";

const listTmsProviderLiveProjectsMock = vi.fn();
const getActiveCredentialMock = vi.fn();

vi.mock("@/lib/database", () => ({
  schema: {
    projects: {
      id: "id",
      name: "name",
      description: "description",
      translationContext: "translation_context",
      source: "source",
    },
  },
}));

vi.mock("@/lib/providers/tms-provider-live", () => ({
  listTmsProviderLiveProjects: (...args: unknown[]) => listTmsProviderLiveProjectsMock(...args),
  TmsProviderLiveError: class TmsProviderLiveError extends Error {
    constructor(
      readonly code: string,
      message?: string,
    ) {
      super(message ?? code);
      this.name = "TmsProviderLiveError";
    }
  },
}));

vi.mock("@/lib/providers/organization-external-tms-provider-credentials", () => ({
  getActiveOrganizationExternalTmsProviderCredentialRow: (...args: unknown[]) =>
    getActiveCredentialMock(...args),
}));

vi.mock("@/lib/tools/tool-access", () => ({
  toolAccessibleProjectsWhere: vi.fn(async () => ({ sql: "accessible" })),
}));

import { listAgentProjects } from "./list-agent-projects";

function createCtx() {
  const selectResults: unknown[][] = [
    [{ id: "native-1", name: "Native", description: "", translationContext: "" }],
  ];

  return {
    organizationId: "org_1",
    localUserId: "user_1",
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(async () => selectResults.shift() ?? []),
          })),
        })),
      })),
    },
  };
}

describe("listAgentProjects", () => {
  it("returns native projects when no TMS provider is configured", async () => {
    getActiveCredentialMock.mockResolvedValueOnce(null);

    const result = await listAgentProjects(createCtx() as never, 20);

    expect(result.projects).toEqual([
      {
        id: "native-1",
        name: "Native",
        description: "",
        translationContext: "",
        source: "native",
      },
    ]);
    expect(listTmsProviderLiveProjectsMock).not.toHaveBeenCalled();
  });

  it("returns live TMS projects ahead of native projects", async () => {
    getActiveCredentialMock.mockResolvedValueOnce({ providerKind: "crowdin" });
    listTmsProviderLiveProjectsMock.mockResolvedValueOnce([
      {
        id: "ext:crowdin:42",
        name: "HL-Test",
        description: null,
        translationContext: null,
        source: "external_tms",
        externalProviderKind: "crowdin",
        externalProjectId: "42",
      },
    ]);

    const result = await listAgentProjects(createCtx() as never, 20);

    expect(listTmsProviderLiveProjectsMock).toHaveBeenCalledWith("org_1", {
      actorUserId: "user_1",
    });
    expect(result.projects[0]).toMatchObject({
      id: "ext:crowdin:42",
      name: "HL-Test",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: "42",
    });
    expect(result.projects[1]).toMatchObject({
      id: "native-1",
      source: "native",
    });
  });

  it("returns native projects with an error when the user Crowdin connection is missing", async () => {
    const { TmsProviderLiveError } = await import("@/lib/providers/tms-provider-live");

    getActiveCredentialMock.mockResolvedValueOnce({ providerKind: "crowdin" });
    listTmsProviderLiveProjectsMock.mockRejectedValueOnce(
      new TmsProviderLiveError(
        "crowdin_user_connection_required",
        "Connect your Crowdin account before using Crowdin.",
      ),
    );

    const result = await listAgentProjects(createCtx() as never, 20);

    expect(result.projects).toEqual([
      {
        id: "native-1",
        name: "Native",
        description: "",
        translationContext: "",
        source: "native",
      },
    ]);
    expect(result.error).toBe("Connect your Crowdin account before listing Crowdin projects.");
  });
});
