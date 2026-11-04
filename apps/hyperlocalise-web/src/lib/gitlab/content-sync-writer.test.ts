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

vi.mock("@/lib/log", async () => {
  const { createTestLogger } = await import("@/test/create-test-logger");
  return { createLogger: () => createTestLogger() };
});

const access = { accessToken: "token", baseUrl: null };
const startFrom = { branch: "main", commitSha: "abc" };
const mergeRequest = {
  iid: 7,
  web_url: "https://gitlab.com/acme/web/-/merge_requests/7",
  target_branch: "main",
  state: "opened",
  source_project_id: 3,
  target_project_id: 3,
};

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

  it("rebuilds the branch as one commit on the start commit, asking which files exist when not told", async () => {
    const fetchMock = vi
      .fn()
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
    const [file, commit] = calls(fetchMock);
    expect(file!.url).toBe(
      "https://gitlab.com/api/v4/projects/acme%2Fweb/repository/files/locales%2Ffr.json?ref=abc",
    );
    expect(commit).toEqual({
      url: "https://gitlab.com/api/v4/projects/acme%2Fweb/repository/commits",
      method: "POST",
      body: {
        branch: "hyperlocalise/translations-sync-1",
        start_sha: "abc",
        force: true,
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

  it("says what a refused write means: no push access or a protected branch, or the project's rules", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ message: "403 Forbidden" }, 403)));
    const refused = await writer().commitFiles({
      branch: "b",
      startFrom,
      message: "m",
      changes: [{ path: "locales/fr.json", content: Buffer.from("{}"), exists: true }],
    });
    expect(isErr(refused) && refused.error.code).toBe("content_sync_connection_required");
    expect(isErr(refused) && refused.error.message).toMatch(/api scope/);
    expect(isErr(refused) && refused.error.message).toMatch(/protected/);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ message: "rule" }, 400)));
    const rules = await writer().commitFiles({
      branch: "b",
      startFrom,
      message: "m",
      changes: [{ path: "locales/fr.json", content: Buffer.from("{}"), exists: true }],
    });
    expect(isErr(rules) && rules.error.message).toMatch(/project's rules/);
  });

  it("opens a merge request when the branch has none open", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([{ ...mergeRequest, iid: 2, state: "closed" }]))
      .mockResolvedValueOnce(json(mergeRequest));
    vi.stubGlobal("fetch", fetchMock);

    const result = await writer().upsertReview({
      sourceBranch: "hyperlocalise/translations-sync-1",
      targetBranch: "main",
      title: "Translations",
      description: "Body",
      fingerprint: "fp1",
    });

    expect(isOk(result) && result.value).toEqual({
      id: "7",
      url: "https://gitlab.com/acme/web/-/merge_requests/7",
    });
    const [lookup, create] = calls(fetchMock);
    expect(lookup!.url).toBe(
      "https://gitlab.com/api/v4/projects/acme%2Fweb/merge_requests?source_branch=hyperlocalise%2Ftranslations-sync-1&per_page=20",
    );
    expect(create).toEqual({
      url: "https://gitlab.com/api/v4/projects/acme%2Fweb/merge_requests",
      method: "POST",
      body: {
        source_branch: "hyperlocalise/translations-sync-1",
        target_branch: "main",
        title: "Translations",
        description: "Body\n\n<!-- hyperlocalise-sync:fingerprint=fp1 -->",
        remove_source_branch: true,
      },
    });
  });

  it("updates the open merge request into the target, never its title, and ignores forks' and other targets'", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json([
          { ...mergeRequest, iid: 9, source_project_id: 8 }, // from a fork
          { ...mergeRequest, iid: 8, target_branch: "release" },
          mergeRequest,
        ]),
      )
      .mockResolvedValueOnce(json(mergeRequest));
    vi.stubGlobal("fetch", fetchMock);

    const result = await writer().upsertReview({
      sourceBranch: "b",
      targetBranch: "main",
      title: "Translations",
      description: "Body 2",
      fingerprint: "fp2",
    });

    expect(isOk(result) && result.value.id).toBe("7");
    const [, update] = calls(fetchMock);
    expect(update).toEqual({
      url: "https://gitlab.com/api/v4/projects/acme%2Fweb/merge_requests/7",
      method: "PUT",
      body: { description: "Body 2\n\n<!-- hyperlocalise-sync:fingerprint=fp2 -->" },
    });
  });

  it("moves an open merge request to a changed target", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([mergeRequest]))
      .mockResolvedValueOnce(json({ ...mergeRequest, target_branch: "develop" }));
    vi.stubGlobal("fetch", fetchMock);

    await writer().upsertReview({
      sourceBranch: "b",
      targetBranch: "develop",
      title: "T",
      description: "D",
      fingerprint: "fp3",
    });

    expect(calls(fetchMock)[1]!.body).toEqual({
      description: "D\n\n<!-- hyperlocalise-sync:fingerprint=fp3 -->",
      target_branch: "develop",
    });
  });

  it("finds the branch's review in any state, preferring an open one into the target, with its marks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        json([
          { ...mergeRequest, iid: 11, state: "closed" },
          { ...mergeRequest, iid: 10, target_branch: "release" },
          {
            ...mergeRequest,
            description: "Body\n\n<!-- hyperlocalise-sync:fingerprint=abc123 -->",
          },
        ]),
      ),
    );
    const found = await writer().findReview({ sourceBranch: "b", targetBranch: "main" });
    expect(isOk(found) && found.value).toEqual({
      id: "7",
      url: "https://gitlab.com/acme/web/-/merge_requests/7",
      state: "open",
      fingerprint: "abc123",
      closedBySync: false,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        json([
          {
            ...mergeRequest,
            iid: 11,
            state: "closed",
            description: "Closed by Hyperlocalise.\n\n<!-- hyperlocalise-sync:closed -->",
          },
        ]),
      ),
    );
    const closed = await writer().findReview({ sourceBranch: "b", targetBranch: "main" });
    expect(isOk(closed) && closed.value).toMatchObject({ state: "closed", closedBySync: true });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json([])));
    const none = await writer().findReview({ sourceBranch: "b", targetBranch: "main" });
    expect(isOk(none) && none.value).toBeNull();
  });

  it("deletes the sync branch, and treats one already gone as deleted", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(isOk(await writer().deleteBranch("hyperlocalise/translations-sync-1"))).toBe(true);
    expect(calls(fetchMock)[0]).toMatchObject({
      url: "https://gitlab.com/api/v4/projects/acme%2Fweb/repository/branches/hyperlocalise%2Ftranslations-sync-1",
      method: "DELETE",
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({}, 404)));
    expect(isOk(await writer().deleteBranch("gone"))).toBe(true);
  });

  it("closes a merge request with the reason and the sync's mark", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ ...mergeRequest, state: "closed" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await writer().closeReview({ id: "7", reason: "Nothing left to send." });

    expect(isOk(result)).toBe(true);
    expect(calls(fetchMock)[0]).toEqual({
      url: "https://gitlab.com/api/v4/projects/acme%2Fweb/merge_requests/7",
      method: "PUT",
      body: {
        description: "Nothing left to send.\n\n<!-- hyperlocalise-sync:closed -->",
        state_event: "close",
      },
    });
  });
});
