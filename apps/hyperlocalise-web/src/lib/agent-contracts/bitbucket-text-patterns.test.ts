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
  extractBitbucketPullRequestReferences,
  extractBitbucketRepositoryReferences,
  normalizeBitbucketRepositoryFullName,
} from "./bitbucket-text-patterns";

describe("bitbucket text patterns", () => {
  it("extracts a repository from its page, source and clone links", () => {
    expect(
      extractBitbucketRepositoryReferences(
        [
          "https://bitbucket.org/acme/web",
          "https://bitbucket.org/acme/web/src/main/locales/en.json",
          "https://minh@bitbucket.org/acme/web.git",
          "(https://bitbucket.org/acme/web).",
        ].join(" "),
      ),
    ).toEqual(["acme/web"]);
  });

  it("keeps separate repositories apart and ignores other hosts", () => {
    expect(
      extractBitbucketRepositoryReferences(
        "Compare https://bitbucket.org/acme/web and https://bitbucket.org/acme/mobile-app, not https://github.com/acme/web or https://bitbucket.example.com/acme/api",
      ),
    ).toEqual(["acme/web", "acme/mobile-app"]);
  });

  it("ignores Bitbucket's own pages", () => {
    expect(
      extractBitbucketRepositoryReferences(
        "https://bitbucket.org/account/settings https://bitbucket.org/product/pricing https://bitbucket.org/acme",
      ),
    ).toEqual([]);
  });

  it("extracts pull request links", () => {
    expect(
      extractBitbucketPullRequestReferences(
        "Review https://bitbucket.org/acme/web/pull-requests/42/diff and https://bitbucket.org/acme/web/pull-requests/42 again",
      ),
    ).toEqual([
      {
        repositoryFullName: "acme/web",
        pullRequestId: 42,
        sourceUrl: "https://bitbucket.org/acme/web/pull-requests/42",
      },
    ]);
  });

  it("does not read a pull request number that runs into other text", () => {
    expect(
      extractBitbucketPullRequestReferences("https://bitbucket.org/acme/web/pull-requests/42abc"),
    ).toEqual([]);
  });

  it("normalizes a pasted full name", () => {
    expect(normalizeBitbucketRepositoryFullName(" acme/web.git ")).toBe("acme/web");
    expect(normalizeBitbucketRepositoryFullName("acme/web/extra")).toBeNull();
    expect(normalizeBitbucketRepositoryFullName("acme")).toBeNull();
    expect(normalizeBitbucketRepositoryFullName("acme/we b")).toBeNull();
    expect(normalizeBitbucketRepositoryFullName("account/web")).toBeNull();
  });
});
