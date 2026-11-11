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

  it("stops project URL capture at the GitLab /-/ boundary", () => {
    expect(
      extractGitLabProjectPathReferences(
        [
          "https://gitlab.com/acme/web/-/tree/main",
          "https://gitlab.com/acme/web/-/blob/main/README.md",
          "https://gitlab.com/acme/web/-/issues/12",
          "https://gitlab.com/acme/web/-/commits/main",
        ].join(" "),
      ),
    ).toEqual(["acme/web"]);
  });

  it("extracts nested group project paths from tree URLs", () => {
    expect(
      extractGitLabProjectPathReferences("See https://gitlab.com/acme/platform/web/-/tree/main"),
    ).toEqual(["acme/platform/web"]);
  });

  it("keeps hyphenated project names while stopping at /-/", () => {
    expect(
      extractGitLabProjectPathReferences("https://gitlab.com/acme/my-web/-/tree/feature-login"),
    ).toEqual(["acme/my-web"]);
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

describe("links to a workspace's own server", () => {
  it("finds projects and merge requests on that server only", () => {
    const text =
      "See https://git.acme.example/acme/web/-/merge_requests/4 and https://gitlab.com/other/app";

    expect(extractGitLabMergeRequestReferences(text, "https://git.acme.example")).toMatchObject([
      { pathWithNamespace: "acme/web", mergeRequestIid: 4 },
    ]);
    expect(extractGitLabProjectPathReferences(text, "https://git.acme.example")).toEqual([
      "acme/web",
    ]);
  });

  it("handles a server under a path or on a port", () => {
    expect(
      extractGitLabProjectPathReferences(
        "https://git.acme.example:8443/gitlab/acme/web",
        "https://git.acme.example:8443/gitlab",
      ),
    ).toEqual(["acme/web"]);
  });

  it("doesn't match a longer host or treat dots as wildcards", () => {
    const serverUrl = "https://git.acme.example";

    expect(
      extractGitLabProjectPathReferences("https://git.acme.example.evil.test/a/b", serverUrl),
    ).toEqual([]);
    expect(extractGitLabProjectPathReferences("https://gitxacme.example/a/b", serverUrl)).toEqual(
      [],
    );
  });
});
