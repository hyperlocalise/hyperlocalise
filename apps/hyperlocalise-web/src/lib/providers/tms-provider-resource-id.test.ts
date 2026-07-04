import { describe, expect, it } from "vite-plus/test";

import {
  encodeProviderJobId,
  encodeProviderProjectId,
  parseProviderJobId,
  parseProviderProjectId,
  resolveEncodedProviderJobId,
  resolveJobProjectId,
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

  it("parses percent-encoded project ids from route params", () => {
    expect(parseProviderProjectId("ext%3Acrowdin%3A902807")).toEqual({
      providerKind: "crowdin",
      externalProjectId: "902807",
    });
    expect(parseProviderProjectId("ext%253Acrowdin%253A902807")).toEqual({
      providerKind: "crowdin",
      externalProjectId: "902807",
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

  it("parses percent-encoded job ids from route params", () => {
    expect(parseProviderJobId("ext%3Acrowdin%3A902807%3A2001")).toEqual({
      providerKind: "crowdin",
      externalProjectId: "902807",
      externalJobId: "2001",
    });
    expect(parseProviderJobId("ext%253Acrowdin%253A902807%253A2001")).toEqual({
      providerKind: "crowdin",
      externalProjectId: "902807",
      externalJobId: "2001",
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

  it("returns encoded job ids unchanged", () => {
    expect(
      resolveEncodedProviderJobId({
        jobId: "ext:crowdin:42:9001",
        projectId: "ext:crowdin:42",
        externalProviderKind: "crowdin",
        externalJobId: "9001",
        externalTaskId: null,
      }),
    ).toBe("ext:crowdin:42:9001");
  });

  it("builds encoded job ids from synced job records", () => {
    expect(
      resolveEncodedProviderJobId({
        jobId: "job_crowdin_1204",
        projectId: "ext:crowdin:902807",
        externalProviderKind: "crowdin",
        externalJobId: "2001",
        externalTaskId: null,
      }),
    ).toBe("ext:crowdin:902807:2001");
  });

  it("prefers externalJobId over externalTaskId when building encoded ids", () => {
    expect(
      resolveEncodedProviderJobId({
        jobId: "job_crowdin_1204",
        projectId: "ext:crowdin:902807",
        externalProviderKind: "crowdin",
        externalJobId: "2001",
        externalTaskId: "9999",
      }),
    ).toBe("ext:crowdin:902807:2001");
  });

  it("resolves project ids from explicit values or encoded job ids", () => {
    expect(resolveJobProjectId("ext:crowdin:902807", "ext:crowdin:902807:2001")).toBe(
      "ext:crowdin:902807",
    );
    expect(resolveJobProjectId(null, "ext:crowdin:902807:2001")).toBe("ext:crowdin:902807");
    expect(resolveJobProjectId(null, "job_native")).toBeNull();
  });
});
