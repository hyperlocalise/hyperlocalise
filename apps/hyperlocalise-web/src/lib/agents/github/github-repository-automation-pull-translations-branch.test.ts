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

import { buildPullTranslationsBranchName } from "./github-repository-automation-pull-translations-branch";

describe("buildPullTranslationsBranchName", () => {
  it("uses a stable branch name per automation job", () => {
    expect(buildPullTranslationsBranchName("job-abc-123")).toBe(
      "hyperlocalise/translations-job-abc-123",
    );
  });
});
