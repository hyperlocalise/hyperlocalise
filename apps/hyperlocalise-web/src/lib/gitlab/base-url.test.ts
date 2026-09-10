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

import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  isGitLabComOrigin,
  normalizeGitLabInstanceOrigin,
  resolveGitLabApiOrigin,
} from "./base-url";

describe("gitlab base url", () => {
  it("normalizes a public self-hosted origin", () => {
    const result = normalizeGitLabInstanceOrigin("https://gitlab.acme.example/group");

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected ok");
    }
    expect(result.value).toBe("https://gitlab.acme.example");
  });

  it("rejects gitlab.com as a self-hosted origin", () => {
    const result = normalizeGitLabInstanceOrigin("https://gitlab.com");

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error("expected err");
    }
    expect(result.error.code).toBe("gitlab_com_uses_pipes");
    expect(isGitLabComOrigin("https://www.gitlab.com")).toBe(true);
  });

  it("rejects loopback and non-https URLs", () => {
    const httpResult = normalizeGitLabInstanceOrigin("http://gitlab.acme.example");
    expect(isErr(httpResult)).toBe(true);
    if (!isErr(httpResult)) {
      throw new Error("expected err");
    }
    expect(httpResult.error.code).toBe("gitlab_base_url_invalid");

    const loopbackResult = normalizeGitLabInstanceOrigin("https://localhost:8443");
    expect(isErr(loopbackResult)).toBe(true);
    if (!isErr(loopbackResult)) {
      throw new Error("expected err");
    }
    expect(loopbackResult.error.code).toBe("gitlab_base_url_invalid");

    const invalidResult = normalizeGitLabInstanceOrigin("not a url");
    expect(isErr(invalidResult)).toBe(true);
    if (!isErr(invalidResult)) {
      throw new Error("expected err");
    }
    expect(invalidResult.error.code).toBe("gitlab_base_url_invalid");
  });

  it("falls back to gitlab.com when apiOrigin is missing or invalid", () => {
    expect(resolveGitLabApiOrigin(null)).toBe("https://gitlab.com");
    expect(resolveGitLabApiOrigin("https://gitlab.acme.example/api")).toBe(
      "https://gitlab.acme.example",
    );
    expect(resolveGitLabApiOrigin("not a url")).toBe("https://gitlab.com");
  });
});
