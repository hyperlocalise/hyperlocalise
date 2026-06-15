import { describe, expect, it } from "vite-plus/test";

import {
  extractProviderFileIds,
  readProviderAgentRunSourceFilesFromSnapshot,
  readProviderPayloadFromInputSnapshot,
  resolveProviderAgentRunSourceFiles,
} from "@/lib/providers/job-provider-source-files";

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
