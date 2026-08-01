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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { listGitlabMembershipProjects } from "./api";
import { isErr, isOk } from "@/lib/primitives/result/results";

describe("listGitlabMembershipProjects", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns projects for a valid page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          {
            id: 101,
            name: "app",
            path_with_namespace: "acme/app",
            http_url_to_repo: "https://gitlab.com/acme/app.git",
            visibility: "private",
            archived: false,
            default_branch: "main",
          },
        ]),
      ),
    );

    const result = await listGitlabMembershipProjects({
      baseUrl: "https://gitlab.com",
      accessToken: "token",
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.path_with_namespace).toBe("acme/app");
    }
  });

  it("fails the listing when any project payload is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          {
            id: 101,
            name: "app",
            path_with_namespace: "acme/app",
            http_url_to_repo: "https://gitlab.com/acme/app.git",
          },
          {
            id: "not-a-number",
            name: "broken",
          },
        ]),
      ),
    );

    const result = await listGitlabMembershipProjects({
      baseUrl: "https://gitlab.com",
      accessToken: "token",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result) && result.error.code === "gitlab_api_response_invalid") {
      expect(result.error.message).toBe("invalid_project_payload");
    } else {
      expect.fail("expected gitlab_api_response_invalid");
    }
  });
});
