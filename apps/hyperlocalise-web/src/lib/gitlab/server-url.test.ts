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

import { isErr, isOk } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  assertProviderUrlResolvable: vi.fn(async () => undefined),
}));

vi.mock("@/lib/providers/shared/provider-url-resolve", () => ({
  assertProviderUrlResolvable: mocks.assertProviderUrlResolvable,
}));

import { normalizeGitLabServerUrl, resolveGitLabServerUrl } from "./server-url";

function normalized(value: string) {
  const result = normalizeGitLabServerUrl(value);
  return isOk(result) ? result.value : null;
}

describe("normalizeGitLabServerUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mocks.assertProviderUrlResolvable.mockClear();
  });

  it("treats www.gitlab.com as gitlab.com, which www redirects to", () => {
    expect(normalized("https://www.gitlab.com/")).toBe("https://gitlab.com");
    expect(normalized("https://www.gitlab.company.example")).toBe(
      "https://www.gitlab.company.example",
    );
  });

  it("keeps the path and drops trailing slashes, queries and fragments", () => {
    expect(normalized(" https://git.acme.example/ ")).toBe("https://git.acme.example");
    expect(normalized("https://git.acme.example:8443/gitlab/?a=1#b")).toBe(
      "https://git.acme.example:8443/gitlab",
    );
  });

  it.each([
    "",
    "not a url",
    "http://git.acme.example",
    "https://user:pass@git.acme.example",
    "https://localhost:8929",
    "https://127.0.0.1",
    "https://10.0.0.5",
    "https://169.254.169.254",
    "https://intranet",
    "ftp://git.acme.example",
  ])("refuses %j", (value) => {
    expect(normalized(value)).toBeNull();
  });

  it("refuses a local server outside development builds", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(normalized("http://localhost:8929")).toBeNull();
    vi.stubEnv("NODE_ENV", "test");
    expect(normalized("http://localhost:8929")).toBeNull();
  });

  it("refuses a local server when NODE_ENV is unset", () => {
    vi.stubEnv("NODE_ENV", undefined);
    expect(normalized("http://localhost:8929")).toBeNull();
  });

  it("accepts only this machine's server in a development build", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(normalized("http://localhost:8929/")).toBe("http://localhost:8929");
    expect(normalized("http://127.0.0.1:8929/gitlab")).toBe("http://127.0.0.1:8929/gitlab");
    expect(normalized("http://10.0.0.5")).toBeNull();
    expect(normalized("http://user:pass@localhost:8929")).toBeNull();
  });
});

describe("resolveGitLabServerUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses a public name that resolves to a private address", async () => {
    mocks.assertProviderUrlResolvable.mockRejectedValueOnce(new Error("blocked"));

    const result = await resolveGitLabServerUrl("https://git.acme.example");

    expect(isErr(result) && result.error.code).toBe("gitlab_server_url_invalid");
  });

  it("does not look up a local development server", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.assertProviderUrlResolvable.mockClear();

    const result = await resolveGitLabServerUrl("http://localhost:8929");

    expect(isOk(result)).toBe(true);
    expect(mocks.assertProviderUrlResolvable).not.toHaveBeenCalled();
  });
});
