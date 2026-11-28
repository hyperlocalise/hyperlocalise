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

import { createBitbucketContentSyncReader } from "./content-sync-reader";

vi.mock("@/lib/log", async () => {
  const { createTestLogger } = await import("@/test/create-test-logger");
  return { createLogger: () => createTestLogger() };
});

const repo = "https://api.bitbucket.org/2.0/repositories/acme/web";

function reader(accountEmail: string | null = null) {
  return createBitbucketContentSyncReader({
    access: { accessToken: "token", accountEmail },
    fullName: "acme/web",
  });
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function requestedUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

describe("createBitbucketContentSyncReader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the main branch's head and parents when no branch is named", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({ uuid: "{r1}", full_name: "acme/web", mainbranch: { name: "main" } }),
      )
      .mockResolvedValueOnce(
        json({ name: "main", target: { hash: "abc", parents: [{ hash: "p1" }] } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await reader().resolveBranchHead({});

    expect(isOk(result) && result.value).toEqual({
      branch: "main",
      commitSha: "abc",
      parentCommitShas: ["p1"],
    });
    expect(requestedUrls(fetchMock)).toEqual([repo, `${repo}/refs/branches/main`]);
  });

  it("calls a missing branch a missing branch, not a missing repository", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({}, 404)));

    const result = await reader().resolveBranchHead({ branch: "release/1" });

    expect(isErr(result) && result.error.code).toBe("content_sync_branch_not_found");
  });

  it("sends an API token with its email and an access token alone", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ name: "main", target: { hash: "abc", parents: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    await reader("dev@example.com").resolveBranchHead({ branch: "main" });
    await reader().resolveBranchHead({ branch: "main" });

    const headers = fetchMock.mock.calls.map(
      (call) => (call[1] as RequestInit).headers as Record<string, string>,
    );
    expect(headers[0]!.Authorization).toBe(
      `Basic ${Buffer.from("dev@example.com:token").toString("base64")}`,
    );
    expect(headers[1]!.Authorization).toBe("Bearer token");
  });

  it("lists every file under the folder one folder at a time, following pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          values: [
            { path: "locales/en.json", type: "commit_file" },
            { path: "locales/pages", type: "commit_directory" },
          ],
          next: `${repo}/src/abc/locales/?page=2`,
        }),
      )
      .mockResolvedValueOnce(json({ values: [{ path: "locales/fr.json", type: "commit_file" }] }))
      .mockResolvedValueOnce(
        json({ values: [{ path: "locales/pages/home.html", type: "commit_file" }] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await reader().listFiles({ commitSha: "abc", folder: "/locales/" });

    expect(isOk(result) && result.value).toEqual([
      { path: "locales/en.json", contentId: null },
      { path: "locales/fr.json", contentId: null },
      { path: "locales/pages/home.html", contentId: null },
    ]);
    const urls = requestedUrls(fetchMock);
    expect(urls[0]).toMatch(new RegExp(`^${repo}/src/abc/locales/\\?`));
    expect(urls[1]).toBe(`${repo}/src/abc/locales/?page=2`);
    expect(urls[2]).toMatch(new RegExp(`^${repo}/src/abc/locales/pages/\\?`));
  });

  it("never follows a next link off the API's own origin", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ values: [], next: "https://attacker.example/steal?page=2" })),
    );

    const result = await reader().listFiles({ commitSha: "abc", folder: "locales" });

    expect(isErr(result) && result.error.code).toBe("content_sync_provider_failed");
  });

  it("answers a missing folder with an empty listing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({}, 404)));

    const result = await reader().listFiles({ commitSha: "abc", folder: "missing" });

    expect(isOk(result) && result.value).toEqual([]);
  });

  it("reads a file's bytes and tells a missing file from a refused token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])))
      .mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(json({}, 401));
    vi.stubGlobal("fetch", fetchMock);

    const bytes = await reader().readFile({ commitSha: "abc", path: "locales/a b#.json" });
    const missing = await reader().readFile({ commitSha: "abc", path: "locales/x.json" });
    const refused = await reader().readFile({ commitSha: "abc", path: "locales/y.json" });

    expect(isOk(bytes) && [...bytes.value]).toEqual([0xef, 0xbb, 0xbf, 0x7b, 0x7d]);
    expect(requestedUrls(fetchMock)[0]).toBe(`${repo}/src/abc/locales/a%20b%23.json`);
    expect(isErr(missing) && missing.error.code).toBe("content_sync_file_not_found");
    expect(isErr(refused) && refused.error.code).toBe("content_sync_connection_required");
  });

  it("lists the paths a commit touches from its diffstat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        json({
          values: [
            { new: { path: "locales/fr.json" }, old: { path: "locales/fr.json" } },
            { new: { path: "locales/de.json" }, old: null },
            { new: null, old: { path: "locales/es.json" } },
          ],
        }),
      ),
    );

    const result = await reader().listCommitPaths({ commitSha: "def" });

    expect(isOk(result) && result.value?.sort()).toEqual([
      "locales/de.json",
      "locales/es.json",
      "locales/fr.json",
    ]);
  });
});
