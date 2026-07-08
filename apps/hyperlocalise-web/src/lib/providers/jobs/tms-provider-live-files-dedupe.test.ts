import { describe, expect, it } from "vite-plus/test";

import {
  dedupeLiveFilesBySourcePath,
  type LiveFileSourcePathRecord,
} from "./tms-provider-live-file-dedupe";

function liveFile(input: {
  sourcePath: string;
  resourceType: "file" | "key";
  externalResourceId: string;
  revision?: string | null;
}): LiveFileSourcePathRecord {
  return {
    sourcePath: input.sourcePath,
    provider: {
      resourceType: input.resourceType,
      externalResourceId: input.externalResourceId,
      revision: input.revision ?? null,
    },
  };
}

describe("dedupeLiveFilesBySourcePath", () => {
  it("keeps one file per source path", () => {
    const files = dedupeLiveFilesBySourcePath([
      liveFile({
        sourcePath: "service/specialty/en/long-term-care-clinician.md",
        resourceType: "file",
        externalResourceId: "upload-1",
      }),
      liveFile({
        sourcePath: "service/specialty/en/long-term-care-clinician.md",
        resourceType: "file",
        externalResourceId: "upload-2",
        revision: "2026-05-02T00:00:00Z",
      }),
    ]);

    expect(files).toHaveLength(1);
    expect(files[0]?.provider?.externalResourceId).toBe("upload-2");
  });

  it("prefers file resources over key resources for the same path", () => {
    const files = dedupeLiveFilesBySourcePath([
      liveFile({
        sourcePath: "locales/en-US/home.json",
        resourceType: "key",
        externalResourceId: "key-1",
      }),
      liveFile({
        sourcePath: "locales/en-US/home.json",
        resourceType: "file",
        externalResourceId: "upload-1",
      }),
    ]);

    expect(files).toHaveLength(1);
    expect(files[0]?.provider?.resourceType).toBe("file");
    expect(files[0]?.provider?.externalResourceId).toBe("upload-1");
  });
});
