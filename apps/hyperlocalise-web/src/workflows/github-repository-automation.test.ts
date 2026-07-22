/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
