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
  extractGitLabProjectReferences,
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
        origin: "https://gitlab.com",
        pathWithNamespace: "acme/platform/web",
        mergeRequestIid: 42,
        sourceUrl: "https://gitlab.com/acme/platform/web/-/merge_requests/42",
      },
    ]);
  });

  it("extracts merge request URLs from a self-hosted origin", () => {
    expect(
      extractGitLabMergeRequestReferences(
        "Review https://gitlab.acme.example/acme/web/-/merge_requests/9",
        ["https://gitlab.acme.example"],
      ),
    ).toEqual([
      {
        origin: "https://gitlab.acme.example",
        pathWithNamespace: "acme/web",
        mergeRequestIid: 9,
        sourceUrl: "https://gitlab.acme.example/acme/web/-/merge_requests/9",
      },
    ]);
  });

  it("normalizes GitLab path_with_namespace values", () => {
    expect(normalizeGitLabPathWithNamespace("acme/web.git")).toBe("acme/web");
    expect(normalizeGitLabPathWithNamespace("acme")).toBeNull();
    expect(normalizeGitLabPathWithNamespace("acme/sub/web")).toBe("acme/sub/web");
  });

  it("returns origin-tagged project references for allowed hosts", () => {
    expect(
      extractGitLabProjectReferences(
        "See https://gitlab.acme.example/acme/platform/web/-/tree/main",
        ["https://gitlab.acme.example"],
      ),
    ).toEqual([
      {
        origin: "https://gitlab.acme.example",
        pathWithNamespace: "acme/platform/web",
        sourceUrl: "https://gitlab.acme.example/acme/platform/web",
      },
    ]);
  });
});
