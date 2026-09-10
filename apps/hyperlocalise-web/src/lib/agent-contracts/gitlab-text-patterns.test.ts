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
  extractGitLabMergeRequestReferences,
  extractGitLabProjectPathReferences,
  normalizeGitLabPathWithNamespace,
} from "./gitlab-text-patterns";

describe("gitlab text patterns", () => {
  it("extracts nested GitLab project paths from URLs", () => {
    expect(
      extractGitLabProjectPathReferences(
        "Clone https://gitlab.com/acme/platform/web and ignore github.com/acme/web",
      ),
    ).toEqual(["acme/platform/web"]);
  });

  it("extracts merge request URLs including nested groups", () => {
    expect(
      extractGitLabMergeRequestReferences(
        "Review https://gitlab.com/acme/platform/web/-/merge_requests/42 please",
      ),
    ).toEqual([
      {
        pathWithNamespace: "acme/platform/web",
        mergeRequestIid: 42,
        sourceUrl: "https://gitlab.com/acme/platform/web/-/merge_requests/42",
      },
    ]);
  });

  it("normalizes GitLab path_with_namespace values", () => {
    expect(normalizeGitLabPathWithNamespace("acme/web.git")).toBe("acme/web");
    expect(normalizeGitLabPathWithNamespace("acme")).toBeNull();
    expect(normalizeGitLabPathWithNamespace("acme/sub/web")).toBe("acme/sub/web");
  });
});
