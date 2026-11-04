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

import { createGitLabContentSyncWriter } from "./content-sync-writer";

const access = { accessToken: "token", baseUrl: null };
const startFrom = { branch: "main", commitSha: "abc" };

function writer() {
  return createGitLabContentSyncWriter({ access, pathWithNamespace: "acme/web" });
}

type Call = { url: string; method: string; body: unknown };

function calls(fetchMock: ReturnType<typeof vi.fn>): Call[] {
  return fetchMock.mock.calls.map((call) => {
    const init = call[1] as RequestInit | undefined;
    return {
      url: String(call[0]),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
  });
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

describe("createGitLabContentSyncWriter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates the branch from the start commit and the files it doesn't have yet", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({}, 404)) // branch lookup
      .mockResolvedValueOnce(json({}, 404)) // fr.json at the start commit
      .mockResolvedValueOnce(json({ id: "def" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await writer().commitFiles({
      branch: "hyperlocalise/translations-sync-1",
      startFrom,
      message: "chore(i18n): update translations",
      changes: [
        { path: "locales/fr.json", content: Buffer.from('{"a":"b"}') },
        { path: "locales/es.json", content: Buffer.from("{}"), exists: true },
      ],
    });

    expect(isOk(result) && result.value).toEqual({ commitSha: "def" });
    const [branch, file, commit] = calls(fetchMock);
    expect(branch!.url).toBe(
      "https://gitlab.com/api/v4/projects/acme%2Fweb/repository/branches/hyperlocalise%2Ftranslations-sync-1",
    );
    expect(file!.url).toBe(
      "https://gitlab.com/api/v4/projects/acme%2Fweb/repository/files/locales%2Ffr.json?ref=abc",
    );
    expect(commit).toEqual({
      url: "https://gitlab.com/api/v4/projects/acme%2Fweb/repository/commits",
      method: "POST",
      body: {
        branch: "hyperlocalise/translations-sync-1",
        start_branch: "main",
        commit_message: "chore(i18n): update translations",
        actions: [
          {
            action: "create",
            file_path: "locales/fr.json",
            content: Buffer.from('{"a":"b"}').toString("base64"),
            encoding: "base64",
          },
          {
            action: "update",
            file_path: "locales/es.json",
            content: Buffer.from("{}").toString("base64"),
            encoding: "base64",
          },
        ],
      },
    });
  });

  it("adds to a branch it already has, looking files up on that branch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ name: "hyperlocalise/translations-sync-1" }))
      .mockResolvedValueOnce(json({ file_name: "fr.json" }))
      .mockResolvedValueOnce(json({ id: "ghi" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await writer().commitFiles({
      branch: "hyperlocalise/translations-sync-1",
      startFrom,
      message: "m",
      changes: [{ path: "locales/fr.json", content: Buffer.from("{}") }],
    });

    expect(isOk(result)).toBe(true);
    const [, file, commit] = calls(fetchMock);
    expect(file!.url).toContain("?ref=hyperlocalise%2Ftranslations-sync-1");
    expect(commit!.body).not.toHaveProperty("start_branch");
    expect((commit!.body as { actions: { action: string }[] }).actions[0]!.action).toBe("update");
  });

  it("says when the token can't write", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({}, 404))
        .mockResolvedValueOnce(json({}, 404))
        .mockResolvedValueOnce(json({ message: "403 Forbidden" }, 403)),
    );

    const result = await writer().commitFiles({
      branch: "b",
      startFrom,
      message: "m",
      changes: [{ path: "locales/fr.json", content: Buffer.from("{}") }],
    });

    expect(isErr(result) && result.error.code).toBe("content_sync_connection_required");
  });

  it("opens a merge request when the branch has none", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(
        json({ iid: 7, web_url: "https://gitlab.com/acme/web/-/merge_requests/7" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await writer().upsertReview({
      sourceBranch: "hyperlocalise/translations-sync-1",
      targetBranch: "main",
      title: "Translations",
      description: "Body",
    });

    expect(isOk(result) && result.value).toEqual({
      id: "7",
      url: "https://gitlab.com/acme/web/-/merge_requests/7",
    });
    const [lookup, create] = calls(fetchMock);
    expect(lookup!.url).toBe(
      "https://gitlab.com/api/v4/projects/acme%2Fweb/merge_requests?source_branch=hyperlocalise%2Ftranslations-sync-1&target_branch=main&state=opened&per_page=1",
    );
    expect(create).toEqual({
      url: "https://gitlab.com/api/v4/projects/acme%2Fweb/merge_requests",
      method: "POST",
      body: {
        source_branch: "hyperlocalise/translations-sync-1",
        target_branch: "main",
        title: "Translations",
        description: "Body",
        remove_source_branch: true,
      },
    });
  });

  it("updates the open merge request instead of opening another", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json([{ iid: 7, web_url: "https://gitlab.com/acme/web/-/merge_requests/7" }]),
      )
      .mockResolvedValueOnce(
        json({ iid: 7, web_url: "https://gitlab.com/acme/web/-/merge_requests/7" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await writer().upsertReview({
      sourceBranch: "b",
      targetBranch: "main",
      title: "Translations",
      description: "Body 2",
    });

    expect(isOk(result) && result.value.id).toBe("7");
    const [, update] = calls(fetchMock);
    expect(update).toEqual({
      url: "https://gitlab.com/api/v4/projects/acme%2Fweb/merge_requests/7",
      method: "PUT",
      body: { title: "Translations", description: "Body 2" },
    });
  });
});
