import { describe, expect, it } from "vite-plus/test";

import { buildFigmaJobUrl, parsePageJobBinding, serializePageJobBinding } from "./page-binding";

describe("page job binding", () => {
  it("round-trips a valid binding", () => {
    const binding = {
      projectId: "proj_1",
      jobId: "job_1",
      sourcePath: "figma/files/abc/pages/12:34.json",
    };
    expect(parsePageJobBinding(serializePageJobBinding(binding))).toEqual(binding);
  });

  it("rejects missing fields and invalid JSON", () => {
    expect(parsePageJobBinding(null)).toBeNull();
    expect(parsePageJobBinding("{")).toBeNull();
    expect(parsePageJobBinding(JSON.stringify({ projectId: "proj_1", jobId: "" }))).toBeNull();
  });

  it("builds a workspace job URL", () => {
    expect(
      buildFigmaJobUrl({
        appUrl: "https://app.hyperlocalise.com/",
        organizationSlug: "acme",
        projectId: "proj_1",
        jobId: "job_1",
      }),
    ).toBe("https://app.hyperlocalise.com/org/acme/projects/proj_1/jobs/job_1");
  });
});
