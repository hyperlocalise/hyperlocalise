import { describe, expect, it } from "vite-plus/test";

import {
  isInFlightJobStatus,
  isTranslatingJobStatus,
  jobPollingStepProgress,
  jobStatusLabel,
  pageJobFromCreate,
} from "./page-job-ui";

describe("page job UI helpers", () => {
  it("hides progress for upload-only queued jobs", () => {
    expect(jobPollingStepProgress("queued", 0)).toBeNull();
    expect(isTranslatingJobStatus("queued")).toBe(false);
    expect(jobPollingStepProgress("running", 3)?.label).toBe("Translating…");
    expect(jobPollingStepProgress("succeeded", 0)).toBeNull();
  });

  it("labels job statuses", () => {
    expect(jobStatusLabel("succeeded")).toBe("Ready");
    expect(jobStatusLabel("failed")).toBe("Failed");
  });

  it("tracks in-flight job states", () => {
    expect(isInFlightJobStatus("queued")).toBe(true);
    expect(isInFlightJobStatus("running")).toBe(true);
    expect(isInFlightJobStatus("succeeded")).toBe(false);
    expect(isTranslatingJobStatus("running")).toBe(true);
  });

  it("builds a queued page job after create", () => {
    expect(
      pageJobFromCreate({
        jobId: "job_1",
        projectId: "proj_1",
        sourcePath: "figma/files/a/b.json",
        targetLocales: ["es"],
      }),
    ).toMatchObject({ jobId: "job_1", status: "queued", targetLocales: ["es"] });
  });
});
