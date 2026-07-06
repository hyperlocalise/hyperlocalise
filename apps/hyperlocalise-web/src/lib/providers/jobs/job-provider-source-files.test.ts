import { describe, expect, it, vi } from "vite-plus/test";

import {
  extractProviderFileIds,
  mapLiveProviderFilesToProviderSourceFiles,
  readProviderAgentRunSourceFilesFromSnapshot,
  readProviderPayloadFromInputSnapshot,
  resolveProviderAgentRunSourceFiles,
  resolveProviderSourceFilesForJob,
} from "@/lib/providers/jobs/job-provider-source-files";

vi.mock("@/lib/providers/jobs/tms-provider-live", () => ({
  listTmsProviderLiveJobFiles: vi.fn(),
}));

describe("extractProviderFileIds", () => {
  it.each([
    { name: "null payload", providerPayload: null },
    { name: "undefined payload", providerPayload: undefined },
    { name: "missing fileIds", providerPayload: {} },
    { name: "non-array fileIds", providerPayload: { fileIds: "123" } },
    { name: "empty fileIds array", providerPayload: { fileIds: [] } },
  ])("returns an empty list for $name", ({ providerPayload }) => {
    expect(extractProviderFileIds(providerPayload)).toEqual([]);
  });

  it("normalizes string and numeric file ids", () => {
    expect(extractProviderFileIds({ fileIds: [123, "456", 0, "0"] })).toEqual([
      "123",
      "456",
      "0",
      "0",
    ]);
  });

  it("filters unsupported and empty file id entries", () => {
    expect(
      extractProviderFileIds({
        fileIds: [123, "", null, undefined, false, true, { id: "456" }, ["789"]],
      }),
    ).toEqual(["123"]);
  });
});

describe("provider agent run source files", () => {
  it("reads explicit source files from the input snapshot", () => {
    expect(
      readProviderAgentRunSourceFilesFromSnapshot({
        sourceFiles: [
          {
            id: "42",
            displayName: "home.json",
            sourcePath: "marketing/home.json",
          },
        ],
      }),
    ).toEqual([
      {
        id: "42",
        displayName: "home.json",
        sourcePath: "marketing/home.json",
        resourceType: null,
        externalUrl: null,
      },
    ]);
  });

  it("reads provider payload from the input snapshot", () => {
    expect(
      readProviderPayloadFromInputSnapshot({
        providerPayload: { fileIds: ["42"] },
      }),
    ).toEqual({ fileIds: ["42"] });
  });

  it("prefers explicit source files over synced provider payload", async () => {
    const sourceFiles = await resolveProviderAgentRunSourceFiles({
      organizationId: "org_1",
      projectId: "project_1",
      providerKind: "crowdin",
      inputSnapshot: {
        sourceFiles: [
          {
            id: "42",
            displayName: "home.json",
            sourcePath: "marketing/home.json",
          },
        ],
      },
      syncedProviderPayload: { fileIds: ["99"] },
    });

    expect(sourceFiles).toEqual([
      {
        id: "42",
        displayName: "home.json",
        sourcePath: "marketing/home.json",
        resourceType: null,
        externalUrl: null,
      },
    ]);
  });
});

describe("resolveProviderSourceFilesForJob", () => {
  it("maps live provider files into provider source file records", () => {
    expect(
      mapLiveProviderFilesToProviderSourceFiles([
        {
          sourcePath: "marketing/home.json",
          filename: "home.json",
          provider: {
            externalResourceId: "1001",
            resourceType: "json",
            externalUrl: "https://crowdin.example/files/1001",
          },
        },
      ]),
    ).toEqual([
      {
        id: "1001",
        displayName: "home.json",
        sourcePath: "marketing/home.json",
        resourceType: "json",
        externalUrl: "https://crowdin.example/files/1001",
      },
    ]);
  });

  it("prefers live provider files over synced resolution", async () => {
    const { listTmsProviderLiveJobFiles } = await import("@/lib/providers/jobs/tms-provider-live");

    vi.mocked(listTmsProviderLiveJobFiles).mockResolvedValue([
      {
        sourcePath: "marketing/home.json",
        filename: "home.json",
        provider: {
          externalResourceId: "1001",
          resourceType: "json",
          externalUrl: null,
        },
      },
    ] as never);

    const sourceFiles = await resolveProviderSourceFilesForJob({
      organizationId: "org_1",
      projectId: "ext:crowdin:902807",
      providerKind: "crowdin",
      providerPayload: { fileIds: ["99"] },
      jobId: "job_crowdin_1204",
      externalJobId: "2001",
      externalTaskId: null,
      actorUserId: "user_1",
    });

    expect(listTmsProviderLiveJobFiles).toHaveBeenCalledWith("org_1", "ext:crowdin:902807:2001", {
      actorUserId: "user_1",
    });
    expect(sourceFiles).toEqual([
      {
        id: "1001",
        displayName: "home.json",
        sourcePath: "marketing/home.json",
        resourceType: "json",
        externalUrl: null,
      },
    ]);
  });
});
