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

import { createBitbucketContentSyncWriter } from "./content-sync-writer";

vi.mock("@/lib/log", async () => {
  const { createTestLogger } = await import("@/test/create-test-logger");
  return { createLogger: () => createTestLogger() };
});

const repo = "https://api.bitbucket.org/2.0/repositories/acme/web";
const startFrom = { branch: "main", commitSha: "abc" };
const branch = "hyperlocalise/translations-sync-1";
const encodedBranch = encodeURIComponent(branch);

function pullRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    title: "chore(i18n): update translations",
    description: "",
    state: "OPEN",
    links: { html: { href: "https://bitbucket.org/acme/web/pull-requests/7" } },
    source: { branch: { name: branch }, repository: { uuid: "{r1}" } },
    destination: { branch: { name: "main" }, repository: { uuid: "{r1}" } },
    ...overrides,
  };
}

function writer() {
  return createBitbucketContentSyncWriter({
    access: { accessToken: "token" },
    fullName: "acme/web",
  });
}

type Call = { url: string; method: string; body: unknown };

function calls(fetchMock: ReturnType<typeof vi.fn>): Call[] {
  return fetchMock.mock.calls.map((call) => {
    const init = call[1] as RequestInit | undefined;
    return {
      url: String(call[0]),
      method: init?.method ?? "GET",
      body:
        typeof init?.body === "string"
          ? JSON.parse(init.body)
          : init?.body instanceof FormData
            ? init.body
            : undefined,
    };
  });
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function created(location: string) {
  return new Response(null, { status: 201, headers: { Location: location } });
}

describe("createBitbucketContentSyncWriter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("makes a new branch as one commit on the start commit, deletions included", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({}, 404)) // the sync branch doesn't exist yet
      .mockResolvedValueOnce(created(`${repo}/commit/def1230000000000000000000000000000000000`));
    vi.stubGlobal("fetch", fetchMock);

    const result = await writer().commitFiles({
      branch,
      startFrom,
      message: "chore(i18n): update translations",
      changes: [
        { path: "locales/fr.json", content: Buffer.from('{"a":"b"}') },
        { path: "locales/old.json", delete: true },
      ],
    });

    expect(isOk(result) && result.value).toEqual({
      commitSha: "def1230000000000000000000000000000000000",
    });
    const [lookup, commit] = calls(fetchMock);
    expect(lookup!.url).toBe(`${repo}/refs/branches/${encodedBranch}`);
    expect(commit!.method).toBe("POST");
    expect(commit!.url).toBe(`${repo}/src`);
    const form = commit!.body as FormData;
    expect(form.get("branch")).toBe(branch);
    expect(form.get("parents")).toBe("abc");
    expect(form.get("message")).toBe("chore(i18n): update translations");
    expect(form.getAll("files")).toEqual(["locales/old.json"]);
    expect(await (form.get("locales/fr.json") as Blob).text()).toBe('{"a":"b"}');
  });

  it("drops a branch that sits anywhere but the start commit before committing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ target: { hash: "stale" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(created(`${repo}/commit/def4560000000000000000000000000000000000`));
    vi.stubGlobal("fetch", fetchMock);

    const result = await writer().commitFiles({
      branch,
      startFrom,
      message: "m",
      changes: [{ path: "locales/fr.json", content: Buffer.from("{}") }],
    });

    expect(isOk(result) && result.value).toEqual({
      commitSha: "def4560000000000000000000000000000000000",
    });
    expect(calls(fetchMock).map((call) => call.method)).toEqual(["GET", "DELETE", "POST"]);
  });

  it("keeps a branch already at the start commit and commits on it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ target: { hash: "abc" } }))
      .mockResolvedValueOnce(created(`${repo}/commit/def7890000000000000000000000000000000000`));
    vi.stubGlobal("fetch", fetchMock);

    await writer().commitFiles({
      branch,
      startFrom,
      message: "m",
      changes: [{ path: "locales/fr.json", content: Buffer.from("{}") }],
    });

    expect(calls(fetchMock).map((call) => call.method)).toEqual(["GET", "POST"]);
  });

  it("explains a refused commit as a token that can't write", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(json({}, 403)),
    );

    const result = await writer().commitFiles({
      branch,
      startFrom,
      message: "m",
      changes: [{ path: "locales/fr.json", content: Buffer.from("{}") }],
    });

    expect(isErr(result) && result.error.code).toBe("content_sync_connection_required");
  });

  it("finds the branch's own pull request with its fingerprint and the sync's close mark", async () => {
    const description =
      "Closed by Hyperlocalise.\n\n[//]: # (hyperlocalise-sync:closed)\n\n---\n\nBody\n\n[//]: # (hyperlocalise-sync:fingerprint=abc123)";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          values: [
            pullRequest({
              id: 9,
              state: "OPEN",
              source: { branch: { name: branch }, repository: { uuid: "{fork}" } },
            }),
            pullRequest({ state: "DECLINED" }),
          ],
        }),
      )
      .mockResolvedValueOnce(json(pullRequest({ state: "DECLINED", description })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await writer().findReview({ sourceBranch: branch, targetBranch: "main" });

    expect(isOk(result) && result.value).toEqual({
      id: "7",
      url: "https://bitbucket.org/acme/web/pull-requests/7",
      state: "closed",
      fingerprint: "abc123",
      closedBySync: true,
    });
    const listUrl = new URL(calls(fetchMock)[0]!.url);
    expect(listUrl.searchParams.get("q")).toBe(`source.branch.name = "${branch}"`);
    expect(listUrl.searchParams.getAll("state")).toEqual([
      "OPEN",
      "MERGED",
      "DECLINED",
      "SUPERSEDED",
    ]);
  });

  it("updates an open pull request's description and target, keeping its title", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ values: [pullRequest({ title: "Renamed by reviewer" })] }))
      .mockResolvedValueOnce(
        json(
          pullRequest({
            title: "Renamed by reviewer",
            destination: { branch: { name: "develop" }, repository: { uuid: "{r1}" } },
          }),
        ),
      )
      .mockResolvedValueOnce(json(pullRequest()));
    vi.stubGlobal("fetch", fetchMock);

    const result = await writer().upsertReview({
      sourceBranch: branch,
      targetBranch: "main",
      title: "chore(i18n): update translations",
      description: "Body",
      fingerprint: "f00d",
    });

    expect(isOk(result) && result.value.id).toBe("7");
    const update = calls(fetchMock)[2]!;
    expect(update.method).toBe("PUT");
    expect(update.url).toBe(`${repo}/pullrequests/7`);
    expect(update.body).toEqual({
      title: "Renamed by reviewer",
      description: "Body\n\n[//]: # (hyperlocalise-sync:fingerprint=f00d)",
      destination: { branch: { name: "main" } },
    });
  });

  it("opens a pull request when the branch has no open one", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ values: [pullRequest({ state: "MERGED" })] }))
      .mockResolvedValueOnce(json(pullRequest({ id: 8 }), 201));
    vi.stubGlobal("fetch", fetchMock);

    const result = await writer().upsertReview({
      sourceBranch: branch,
      targetBranch: "main",
      title: "chore(i18n): update translations",
      description: "Body",
      fingerprint: "f00d",
    });

    expect(isOk(result) && result.value.id).toBe("8");
    const open = calls(fetchMock)[1]!;
    expect(open.method).toBe("POST");
    expect(open.body).toMatchObject({
      title: "chore(i18n): update translations",
      source: { branch: { name: branch } },
      destination: { branch: { name: "main" } },
      close_source_branch: true,
    });
  });

  it("writes the reason and the close mark before declining", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json(
          pullRequest({
            description: "Old body\n\n[//]: # (hyperlocalise-sync:fingerprint=f00d)",
          }),
        ),
      )
      .mockResolvedValueOnce(json(pullRequest()))
      .mockResolvedValueOnce(json(pullRequest({ state: "DECLINED" })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await writer().closeReview({ id: "7", reason: "Nothing to send." });

    expect(isOk(result)).toBe(true);
    const [, update, decline] = calls(fetchMock);
    expect(update!.body).toEqual({
      title: "chore(i18n): update translations",
      description: "Nothing to send.\n\n[//]: # (hyperlocalise-sync:closed)\n\n---\n\nOld body",
    });
    expect(decline!.method).toBe("POST");
    expect(decline!.url).toBe(`${repo}/pullrequests/7/decline`);
  });

  it("treats deleting a branch that is already gone as done", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({}, 404)));

    const result = await writer().deleteBranch(branch);

    expect(isOk(result)).toBe(true);
  });
});
