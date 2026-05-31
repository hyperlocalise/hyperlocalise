import { describe, expect, it } from "vite-plus/test";

import { resolveGithubAutomationCheckConclusion } from "./github-repository-automation";

describe("github repository automation workflow check conclusions", () => {
  const baseJob: {
    workflows: {
      pushSource: boolean;
      pullTranslations: boolean;
      validation: boolean;
      validationBlockOnFailure: boolean;
      statusCheck: { enabled: boolean; mode: "advisory" | "blocking" };
    };
  } = {
    workflows: {
      pushSource: true,
      pullTranslations: false,
      validation: true,
      validationBlockOnFailure: true,
      statusCheck: { enabled: true, mode: "blocking" as const },
    },
  };

  it("fails blocking checks when automation fails", () => {
    expect(
      resolveGithubAutomationCheckConclusion({ job: baseJob as never, status: "failed" }),
    ).toBe("failure");
  });

  it("keeps advisory checks neutral when automation fails", () => {
    expect(
      resolveGithubAutomationCheckConclusion({
        job: {
          ...baseJob,
          workflows: {
            ...baseJob.workflows,
            statusCheck: { enabled: true, mode: "advisory" },
          },
        } as never,
        status: "failed",
      }),
    ).toBe("neutral");
  });

  it("resolves skipped automation explicitly", () => {
    expect(
      resolveGithubAutomationCheckConclusion({ job: baseJob as never, status: "skipped" }),
    ).toBe("skipped");
  });
});
