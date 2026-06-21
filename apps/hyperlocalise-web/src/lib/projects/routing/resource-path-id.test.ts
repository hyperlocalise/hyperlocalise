import { describe, expect, it } from "vitest";

import {
  buildJobDetailHrefFromRecords,
  buildOrgJobHref,
  buildProjectDetailHref,
  formatJobPathSegment,
  formatProjectPathSegment,
  isEncodedProviderPathSegment,
} from "./resource-path-id";

describe("resource-path-id", () => {
  it("formats provider projects with their external id", () => {
    expect(
      formatProjectPathSegment({
        id: "ext:crowdin:902807",
        source: "external_tms",
        externalProjectId: "902807",
      }),
    ).toBe("902807");
  });

  it("formats provider jobs with their external job id", () => {
    expect(
      formatJobPathSegment({
        id: "ext:crowdin:902807:2001",
        externalProviderKind: "crowdin",
        externalJobId: "2001",
      }),
    ).toBe("2001");
  });

  it("keeps native ids unchanged", () => {
    expect(formatProjectPathSegment({ id: "project_website" })).toBe("project_website");
    expect(formatJobPathSegment({ id: "job_native_1" })).toBe("job_native_1");
  });

  it("builds clean org project and job hrefs", () => {
    expect(buildProjectDetailHref("acme", { id: "ext:crowdin:902807" }, "jobs")).toBe(
      "/org/acme/projects/902807/jobs",
    );
    expect(
      buildJobDetailHrefFromRecords(
        "acme",
        { id: "ext:crowdin:902807" },
        { id: "ext:crowdin:902807:2001", externalProviderKind: "crowdin", externalJobId: "2001" },
      ),
    ).toBe("/org/acme/projects/902807/jobs/2001");
    expect(buildOrgJobHref("acme", "902807", "2001", "strings")).toBe(
      "/org/acme/projects/902807/jobs/2001/strings",
    );
  });

  it("detects encoded provider path segments", () => {
    expect(isEncodedProviderPathSegment("ext:crowdin:902807")).toBe(true);
    expect(isEncodedProviderPathSegment("902807")).toBe(false);
  });
});
