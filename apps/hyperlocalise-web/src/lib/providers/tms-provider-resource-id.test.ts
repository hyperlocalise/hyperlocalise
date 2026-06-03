import { describe, expect, it } from "vitest";

import {
  encodeProviderJobId,
  encodeProviderProjectId,
  parseProviderJobId,
  parseProviderProjectId,
} from "@/lib/providers/tms-provider-resource-id";

describe("tms-provider-resource-id", () => {
  it("round-trips encoded project ids", () => {
    const encoded = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "42",
    });

    expect(encoded).toBe("ext:crowdin:42");
    expect(parseProviderProjectId(encoded)).toEqual({
      providerKind: "crowdin",
      externalProjectId: "42",
    });
  });

  it("round-trips encoded job ids", () => {
    const encoded = encodeProviderJobId({
      providerKind: "crowdin",
      externalProjectId: "42",
      externalJobId: "9001",
    });

    expect(encoded).toBe("ext:crowdin:42:9001");
    expect(parseProviderJobId(encoded)).toEqual({
      providerKind: "crowdin",
      externalProjectId: "42",
      externalJobId: "9001",
    });
  });

  it("parses ids when external segments contain colons", () => {
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "proj:with:colons",
    });
    expect(parseProviderProjectId(projectId)).toEqual({
      providerKind: "crowdin",
      externalProjectId: "proj:with:colons",
    });

    const jobId = encodeProviderJobId({
      providerKind: "crowdin",
      externalProjectId: "proj:with:colons",
      externalJobId: "9001",
    });
    expect(parseProviderJobId(jobId)).toEqual({
      providerKind: "crowdin",
      externalProjectId: "proj:with:colons",
      externalJobId: "9001",
    });
  });

  it("rejects malformed encoded ids", () => {
    expect(parseProviderProjectId("project_123")).toBeNull();
    expect(parseProviderJobId("ext:crowdin:42")).toBeNull();
    expect(parseProviderJobId("ext:unknown:1:2")).toBeNull();
  });
});
