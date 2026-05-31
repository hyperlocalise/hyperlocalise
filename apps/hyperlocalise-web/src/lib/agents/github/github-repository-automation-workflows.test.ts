import { describe, expect, it } from "vite-plus/test";

import { githubRepositoryAutomationJobHasRunnableWorkflow } from "./github-repository-automation-workflows";

describe("githubRepositoryAutomationJobHasRunnableWorkflow", () => {
  it("returns true when any workflow is enabled", () => {
    expect(
      githubRepositoryAutomationJobHasRunnableWorkflow({
        pushSource: true,
        pullTranslations: false,
        validation: false,
        validationBlockOnFailure: true,
      }),
    ).toBe(true);

    expect(
      githubRepositoryAutomationJobHasRunnableWorkflow({
        pushSource: false,
        pullTranslations: true,
        validation: false,
        validationBlockOnFailure: true,
      }),
    ).toBe(true);

    expect(
      githubRepositoryAutomationJobHasRunnableWorkflow({
        pushSource: false,
        pullTranslations: false,
        validation: true,
        validationBlockOnFailure: true,
      }),
    ).toBe(true);
  });

  it("returns false when no workflows are enabled", () => {
    expect(
      githubRepositoryAutomationJobHasRunnableWorkflow({
        pushSource: false,
        pullTranslations: false,
        validation: false,
        validationBlockOnFailure: true,
      }),
    ).toBe(false);
  });
});
