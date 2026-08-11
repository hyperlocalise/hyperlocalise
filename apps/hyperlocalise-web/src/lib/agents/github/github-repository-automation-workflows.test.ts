/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
        statusCheck: { enabled: false, mode: "blocking" },
      }),
    ).toBe(true);

    expect(
      githubRepositoryAutomationJobHasRunnableWorkflow({
        pushSource: false,
        pullTranslations: true,
        validation: false,
        validationBlockOnFailure: true,
        statusCheck: { enabled: false, mode: "blocking" },
      }),
    ).toBe(true);

    expect(
      githubRepositoryAutomationJobHasRunnableWorkflow({
        pushSource: false,
        pullTranslations: false,
        validation: true,
        validationBlockOnFailure: true,
        statusCheck: { enabled: false, mode: "blocking" },
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
        statusCheck: { enabled: false, mode: "blocking" },
      }),
    ).toBe(false);
  });
});
