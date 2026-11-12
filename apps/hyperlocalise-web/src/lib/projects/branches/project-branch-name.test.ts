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

import {
  DEFAULT_PROJECT_BRANCH_NAME,
  isValidProjectBranchName,
  normalizeProjectBranchName,
  resolvedProjectBranchName,
} from "./project-branch-name";

describe("project-branch-name", () => {
  it("normalizes surrounding slashes and whitespace", () => {
    expect(normalizeProjectBranchName(" /feature/ios/ ")).toBe("feature/ios");
  });

  it("accepts Phrase-style names and rejects empty, leading, or doubled separators", () => {
    expect(isValidProjectBranchName("main")).toBe(true);
    expect(isValidProjectBranchName("release/ios")).toBe(true);
    expect(isValidProjectBranchName("feature.checkout_1")).toBe(true);
    expect(isValidProjectBranchName("")).toBe(false);
    expect(isValidProjectBranchName("-main")).toBe(false);
    expect(isValidProjectBranchName("feat//ios")).toBe(false);
    expect(isValidProjectBranchName("has space")).toBe(false);
  });

  it("resolves a missing name to main", () => {
    expect(resolvedProjectBranchName(undefined)).toBe(DEFAULT_PROJECT_BRANCH_NAME);
    expect(resolvedProjectBranchName("  ")).toBe(DEFAULT_PROJECT_BRANCH_NAME);
    expect(resolvedProjectBranchName("feature")).toBe("feature");
  });
});
