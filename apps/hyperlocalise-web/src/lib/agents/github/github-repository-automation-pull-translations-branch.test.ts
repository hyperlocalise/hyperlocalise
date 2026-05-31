import { describe, expect, it } from "vite-plus/test";

import { buildPullTranslationsBranchName } from "./github-repository-automation-pull-translations-branch";

describe("buildPullTranslationsBranchName", () => {
  it("uses a stable branch name per automation job", () => {
    expect(buildPullTranslationsBranchName("job-abc-123")).toBe(
      "hyperlocalise/translations-job-abc-123",
    );
  });
});
