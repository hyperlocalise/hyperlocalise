import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { isErr, isOk } from "@/lib/primitives/result/results";

import { createGitLabContentSyncReader } from "./content-sync-reader";

const access = { accessToken: "token", baseUrl: null };

function reader() {
  return createGitLabContentSyncReader({ access, pathWithNamespace: "acme/web" });
}

function requestedUrls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

describe("createGitLabContentSyncReader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves the default branch's head when no branch is set", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 7,
            name: "web",
            path_with_namespace: "acme/web",
            http_url_to_repo: "https://gitlab.com/acme/web.git",
            default_branch: "develop",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ name: "develop", commit: { id: "abc" } })),
      );
    vi.stubGlobal("fetch", fetchMock);

    const head = await reader().resolveBranchHead({ branch: "" });
    expect(isOk(head) && head.value).toEqual({
      branch: "develop",
      commitSha: "abc",
      parentCommitShas: [],
    });
    expect(requestedUrls(fetchMock)).toEqual([
      "https://gitlab.com/api/v4/projects/acme%2Fweb",
      "https://gitlab.com/api/v4/projects/acme%2Fweb/repository/branches/develop",
    ]);
  });

  it("lists the paths a commit touches, added and removed alike", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { old_path: "locales/fr.json", new_path: "locales/fr.json" },
          { old_path: "locales/old.json", new_path: "locales/new.json" },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const paths = await reader().listCommitPaths({ commitSha: "def" });
    expect(isOk(paths) && paths.value).toEqual([
      "locales/fr.json",
      "locales/new.json",
      "locales/old.json",
    ]);
    expect(requestedUrls(fetchMock)).toEqual([
      "https://gitlab.com/api/v4/projects/acme%2Fweb/repository/commits/def/diff?per_page=100&page=1",
    ]);

    // More pages than are read: the commit's paths are unknown rather than an error.
    const page = Array.from({ length: 100 }, (_, i) => ({ old_path: `f${i}`, new_path: `f${i}` }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(page))),
    );
    const tooMany = await reader().listCommitPaths({ commitSha: "def" });
    expect(isOk(tooMany) && tooMany.value).toBeNull();
  });

  it("reports a branch the repository doesn't have", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));

    const head = await reader().resolveBranchHead({ branch: "release/1" });
    expect(isErr(head) && head.error.code).toBe("content_sync_branch_not_found");
  });

  it("lists blobs under a folder across pages and treats a missing folder as empty", async () => {
    const page = (entries: unknown[]) => new Response(JSON.stringify(entries));
    const blob = (path: string) => ({ id: `id-${path}`, type: "blob", path });
    const firstPage = Array.from({ length: 100 }, (_, index) => blob(`locales/${index}.json`));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page(firstPage))
      .mockResolvedValueOnce(
        page([{ id: "tree", type: "tree", path: "locales/sub" }, blob("locales/sub/en.json")]),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const files = await reader().listFiles({ commitSha: "abc", folder: "/locales/" });
    expect(isOk(files) && files.value).toHaveLength(101);
    expect(isOk(files) && files.value.at(-1)).toEqual({
      path: "locales/sub/en.json",
      contentId: "id-locales/sub/en.json",
    });
    const urls = requestedUrls(fetchMock);
    expect(urls[0]).toContain(
      "/repository/tree?ref=abc&recursive=true&per_page=100&page=1&path=locales",
    );
    expect(urls[1]).toContain("page=2");

    const missing = await reader().listFiles({ commitSha: "abc", folder: "nope" });
    expect(isOk(missing) && missing.value).toEqual([]);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async (url: URL) =>
          String(url).includes("page=2") ? new Response("{}", { status: 404 }) : page(firstPage),
        ),
    );
    const lostAccess = await reader().listFiles({ commitSha: "abc", folder: "locales" });
    expect(isErr(lostAccess) && lostAccess.error.code).toBe("content_sync_repository_not_found");

    let served = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => (served++ < 100 ? page(firstPage) : page([]))),
    );
    const exactlyTheCap = await reader().listFiles({ commitSha: "abc", folder: "locales" });
    expect(isOk(exactlyTheCap) && exactlyTheCap.value).toHaveLength(10_000);

    served = 0;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () =>
          served++ < 100 ? page(firstPage) : page([blob("locales/one-more.json")]),
        ),
    );
    const oneOver = await reader().listFiles({ commitSha: "abc", folder: "locales" });
    expect(isErr(oneOver) && oneOver.error.code).toBe("content_sync_provider_failed");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => page(firstPage)),
    );
    const endless = await reader().listFiles({ commitSha: "abc", folder: "locales" });
    expect(isErr(endless) && endless.error).toMatchObject({
      code: "content_sync_provider_failed",
      message: expect.stringContaining("more than 10000 entries"),
    });
  });

  it("reads a file's raw bytes at the commit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(Buffer.from([0xe2, 0x82, 0xac, 0xff])));
    vi.stubGlobal("fetch", fetchMock);

    const bytes = await reader().readFile({ commitSha: "abc", path: "locales/en.json" });
    expect(isOk(bytes) && [...bytes.value]).toEqual([0xe2, 0x82, 0xac, 0xff]);
    expect(requestedUrls(fetchMock)).toEqual([
      "https://gitlab.com/api/v4/projects/acme%2Fweb/repository/files/locales%2Fen.json/raw?ref=abc",
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer token", Accept: "*/*" },
    });
  });

  it("turns a refused token into a connection problem", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));

    const bytes = await reader().readFile({ commitSha: "abc", path: "locales/en.json" });
    expect(isErr(bytes) && bytes.error.code).toBe("content_sync_connection_required");
  });
});
