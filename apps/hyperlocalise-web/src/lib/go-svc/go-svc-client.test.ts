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
import { describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_GO_SVC_BASE_URL, GoSvcClient, GoSvcClientError } from "./go-svc-client";
import { GoSvcRequest, catPath, issueSheetPath, orgPath } from "./go-svc-request";

function clientWith(fetchMock: ReturnType<typeof vi.fn>, getAccessToken = () => "access-token") {
  return new GoSvcClient({
    getAccessToken,
    fetch: fetchMock as unknown as typeof fetch,
  });
}

describe("GoSvcClient", () => {
  it("uses the AWS origin, Bearer access token, and no cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        dictionaries: [],
        total: 0,
      }),
    );
    const client = clientWith(fetchMock);

    await client.dictionary.list("acme / eu", {
      limit: 10,
      offset: 20,
      projectId: "project/a",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme%20%2F%20eu/dictionaries?limit=10&offset=20&projectId=project%2Fa`,
    );
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("omit");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-token");
    expect(new Headers(init.headers).get("cookie")).toBeNull();
  });

  it("resolves a fresh access token for every request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ teams: [] }))
      .mockResolvedValueOnce(Response.json({ teams: [] }));
    const getAccessToken = vi
      .fn()
      .mockResolvedValueOnce("first-token")
      .mockResolvedValueOnce("second-token");
    const client = clientWith(fetchMock, getAccessToken);

    await client.team.list("acme");
    await client.team.list("acme");

    expect(getAccessToken).toHaveBeenCalledTimes(2);
    expect(
      new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get("authorization"),
    ).toBe("Bearer first-token");
    expect(
      new Headers((fetchMock.mock.calls[1][1] as RequestInit).headers).get("authorization"),
    ).toBe("Bearer second-token");
  });

  it("serializes JSON mutations and parses JSON responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        team: {
          id: "team-1",
          organizationId: "org-1",
          slug: "reviewers",
          name: "Reviewers",
          createdAt: "2026-09-22T00:00:00.000Z",
          updatedAt: "2026-09-22T00:00:00.000Z",
        },
      }),
    );
    const client = clientWith(fetchMock);

    const result = await client.team.create("acme", {
      name: "Reviewers",
      slug: "reviewers",
    });

    expect(result.team.id).toBe("team-1");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(init.body).toBe('{"name":"Reviewers","slug":"reviewers"}');
  });

  it("lists, creates, reads, updates, and deletes native projects", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ projects: [] }))
      .mockResolvedValueOnce(Response.json({ project: { id: "project-1", name: "Website" } }))
      .mockResolvedValueOnce(Response.json({ project: { id: "project-1", name: "Website" } }))
      .mockResolvedValueOnce(Response.json({ project: { id: "project-1", name: "Docs" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ locales: [] }))
      .mockResolvedValueOnce(Response.json({ openJobCount: 2 }))
      .mockResolvedValueOnce(
        Response.json({
          contentEditorBehavior: {
            automaticallyGroupIdenticalStrings: false,
            groupingRevision: 0,
            canManage: true,
          },
        }),
      )
      .mockResolvedValueOnce(Response.json({ preview: { affectedOccurrences: 3, groups: 1 } }))
      .mockResolvedValueOnce(
        Response.json({
          contentEditorBehavior: {
            automaticallyGroupIdenticalStrings: true,
            groupingRevision: 1,
            canManage: true,
          },
        }),
      )
      .mockResolvedValueOnce(Response.json({ files: [] }))
      .mockResolvedValueOnce(Response.json({ files: [] }));
    const client = clientWith(fetchMock);

    await client.project.list("acme");
    await client.project.create("acme", {
      name: "Website",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    });
    await client.project.get("acme", "project/1");
    await client.project.update("acme", "project/1", { name: "Docs" });
    await client.project.delete("acme", "project/1");
    await client.project.localeProgress("acme", "project/1");
    await client.project.openJobCount("acme", "project/1");
    await client.project.contentEditorBehavior("acme", "project/1");
    await client.project.previewContentEditorBehavior("acme", "project/1");
    await client.project.updateContentEditorBehavior("acme", "project/1", {
      automaticallyGroupIdenticalStrings: true,
    });
    await client.project.files("acme", "project/1", { limit: 500, search: "home" });
    await client.project.workspaceFiles("acme", { limit: 100 });

    expect(fetchMock.mock.calls[0][0]).toBe(`${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/projects`);
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe("POST");
    expect(fetchMock.mock.calls[2][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/projects/project%2F1`,
    );
    expect((fetchMock.mock.calls[3][1] as RequestInit).method).toBe("PATCH");
    expect((fetchMock.mock.calls[4][1] as RequestInit).method).toBe("DELETE");
    expect(fetchMock.mock.calls[5][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/projects/project%2F1/locale-progress`,
    );
    expect(fetchMock.mock.calls[6][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/projects/project%2F1/open-job-count`,
    );
    expect(fetchMock.mock.calls[7][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/projects/project%2F1/content-editor-behavior`,
    );
    expect(fetchMock.mock.calls[8][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/projects/project%2F1/content-editor-behavior/preview`,
    );
    expect((fetchMock.mock.calls[9][1] as RequestInit).method).toBe("PATCH");
    expect(fetchMock.mock.calls[10][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/projects/project%2F1/files?limit=500&search=home`,
    );
    expect(fetchMock.mock.calls[11][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/workspace-files?limit=100`,
    );
  });

  it("lists, invites, updates, and removes workspace members", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          members: [],
          memberManagement: { canInvite: true, assignableRoles: ["member"] },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          member: { workosUserId: "user_1", email: "ada@example.com", role: "member" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          member: { workosUserId: "user_1", email: "ada@example.com", role: "developer" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = clientWith(fetchMock);

    await client.member.list("acme");
    await client.member.invite("acme", { email: "ada@example.com", role: "member" });
    await client.member.update("acme", "user_1", { role: "developer" });
    await client.member.remove("acme", "user_1");

    expect(fetchMock.mock.calls[0][0]).toBe(`${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/members`);
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe("POST");
    expect((fetchMock.mock.calls[1][1] as RequestInit).body).toBe(
      '{"email":"ada@example.com","role":"member"}',
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/members/user_1`,
    );
    expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe("PATCH");
    expect((fetchMock.mock.calls[3][1] as RequestInit).method).toBe("DELETE");
  });

  it("accepts successful empty responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = clientWith(fetchMock);

    await expect(client.team.delete("acme", "team-1")).resolves.toBeUndefined();
  });

  it("lists, creates, and revokes personal access tokens", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ apiKeys: [] }))
      .mockResolvedValueOnce(
        Response.json({
          apiKey: {
            id: "key-1",
            name: "CI",
            keyPrefix: "hl_AbCd",
            permissions: ["jobs:read"],
            createdAt: "2026-10-05T00:00:00.000Z",
            key: "hl_secret",
            owner: null,
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = clientWith(fetchMock);

    await client.apiKey.list("acme");
    await client.apiKey.create("acme", { name: "CI" });
    await client.apiKey.revoke("acme", "7f1c9d1e-4b2a-4c3d-8e5f-0a1b2c3d4e5f");

    expect(fetchMock.mock.calls[0][0]).toBe(`${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/api-keys`);
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe("POST");
    expect((fetchMock.mock.calls[1][1] as RequestInit).body).toBe('{"name":"CI"}');
    expect(fetchMock.mock.calls[2][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/api-keys/7f1c9d1e-4b2a-4c3d-8e5f-0a1b2c3d4e5f`,
    );
    expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe("DELETE");
  });

  it("throws typed HTTP errors when the JSON error body is not an object", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("null", {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = clientWith(fetchMock);

    const error = await client.team.list("acme").catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(GoSvcClientError);
    expect(error).toMatchObject({
      code: "http_error",
      message: "go-svc request failed with status 502",
      status: 502,
    });
  });

  it("throws typed errors from go-svc error envelopes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: "organization_access_denied",
          message: "Organization access denied",
          details: { organizationSlug: "acme" },
        },
        { status: 403 },
      ),
    );
    const client = clientWith(fetchMock);

    const error = await client.team.list("acme").catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(GoSvcClientError);
    expect(error).toMatchObject({
      code: "organization_access_denied",
      message: "Organization access denied",
      status: 403,
      details: { organizationSlug: "acme" },
    });
  });

  it("reports invalid successful JSON responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<html>upstream failure</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );
    const client = clientWith(fetchMock);

    await expect(client.team.list("acme")).rejects.toMatchObject({
      code: "invalid_response",
      status: 200,
    });
  });

  it("reports missing tokens before issuing a request", async () => {
    const fetchMock = vi.fn();
    const client = clientWith(fetchMock, () => " ");

    await expect(client.team.list("acme")).rejects.toMatchObject({
      code: "missing_access_token",
      status: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("wraps network failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const client = clientWith(fetchMock);

    await expect(client.team.list("acme")).rejects.toMatchObject({
      code: "network_error",
      status: null,
    });
  });

  it("returns download metadata and forwards abort signals", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("Brand\n", {
        headers: {
          "Content-Disposition": `attachment; filename*=UTF-8''dictionary%20en.txt`,
          "Content-Type": "text/plain; charset=utf-8",
          "X-Hyperlocalise-Export-Warning-Count": "3",
        },
      }),
    );
    const client = clientWith(fetchMock);
    const controller = new AbortController();

    const result = await client.dictionary.words.export("acme", "dictionary/1", "en-US", {
      signal: controller.signal,
    });

    expect(result.filename).toBe("dictionary en.txt");
    expect(result.contentType).toBe("text/plain; charset=utf-8");
    expect(result.warningCount).toBe(3);
    expect(await result.blob.text()).toBe("Brand\n");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/dictionaries/dictionary%2F1/words/export?locale=en-US`,
    );
    expect(init.signal).toBe(controller.signal);
  });

  it("defaults export warning count when the header is absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("id,term\n", {
        headers: {
          "Content-Disposition": `attachment; filename="glossary.csv"`,
          "Content-Type": "text/csv",
        },
      }),
    );
    const client = clientWith(fetchMock);

    const result = await client.glossary.export("acme", "glossary/1", { format: "csv" });

    expect(result.warningCount).toBe(0);
    expect(result.filename).toBe("glossary.csv");
  });

  it("routes CAT reads through the nested files/detail/cat path", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ targets: [] }))
      .mockResolvedValueOnce(Response.json({ contentEditorQueue: { segments: [] } }));
    const client = clientWith(fetchMock);

    await client.cat.targets("acme / eu", "project/1", {
      segments: [{ externalStringId: "key/1", sourcePath: "a.json" }],
      targetLocales: ["fr"],
    });
    await client.cat.queue("acme / eu", "project/1", {
      sourcePath: "a.json",
      targetLocale: "fr",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme%20%2F%20eu/projects/project%2F1/files/detail/cat/targets`,
    );
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      body: JSON.stringify({
        segments: [{ externalStringId: "key/1", sourcePath: "a.json" }],
        targetLocales: ["fr"],
      }),
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme%20%2F%20eu/projects/project%2F1/files/detail/cat/queue?sourcePath=a.json&targetLocale=fr`,
    );
  });

  it("downloads glossary import backups under the import-reports path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("backup", {
        headers: {
          "Content-Disposition": `attachment; filename="backup.xlsx"`,
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      }),
    );
    const client = clientWith(fetchMock);

    const result = await client.glossary.importBackup("acme", "glossary/1", "report/9");

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/glossaries/glossary%2F1/import-reports/report%2F9/backup`,
    );
    expect(result.filename).toBe("backup.xlsx");
    expect(result.warningCount).toBe(0);
  });

  it("supports repeated query parameters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ activityLogs: [], actors: [], nextCursor: null }));
    const client = clientWith(fetchMock);

    await client.activityLog.list("acme", {
      eventTypes: ["project_created", "project_deleted"],
      range: "30d",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/activity-logs?eventTypes=project_created&eventTypes=project_deleted&range=30d`,
    );
  });

  it("nests resource methods such as glossary.create", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        glossary: {
          id: "glossary-1",
          name: "Brand",
        },
      }),
    );
    const client = clientWith(fetchMock);

    await client.glossary.create("acme", {
      name: "Brand",
      sourceLocale: "en",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(`${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/glossaries`);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
  });

  it("lists translation memory interchange attempts from go-svc", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        memoryImportAttempts: [],
        nextCursor: null,
        total: 0,
        pagination: { limit: 20, returned: 0, hasMore: false },
      }),
    );
    const client = clientWith(fetchMock);

    await client.memory.importAttempts.list("acme", "memory-1", {
      limit: 20,
      cursor: "cursor-1",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/translation-memories/memory-1/import-attempts?limit=20&cursor=cursor-1`,
    );
  });

  it("queues memory exports and resolves their signed download URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { attemptId: "attempt-1", operation: "export", status: "queued" },
          {
            status: 202,
          },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          url: "https://storage.example/export.tmx",
          method: "GET",
          expiresAt: "2026-10-05T10:00:00.000Z",
          filename: "memory.tmx",
        }),
      );
    const client = clientWith(fetchMock);

    await expect(
      client.memory.entries.createExport("acme", "memory-1", {
        format: "tmx",
        sourceLocale: "en-US",
        targetLocale: "fr-FR",
      }),
    ).resolves.toMatchObject({ attemptId: "attempt-1", status: "queued" });
    await expect(
      client.memory.importAttempts.downloadUrl("acme", "memory-1", "attempt-1"),
    ).resolves.toMatchObject({ filename: "memory.tmx" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/translation-memories/memory-1/entries/export?format=tmx&sourceLocale=en-US&targetLocale=fr-FR`,
    );
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(fetchMock.mock.calls[1][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/translation-memories/memory-1/import-attempts/attempt-1/download`,
    );
  });

  it("creates memory import uploads and queues preview then apply", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            attemptId: "attempt-1",
            operation: "import",
            status: "upload_pending",
            upload: {
              url: "https://storage.example/upload.tmx",
              method: "PUT",
              headers: { "Content-Type": ["application/xml"] },
              expiresAt: "2026-10-06T10:00:00.000Z",
            },
          },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ attemptId: "attempt-1", status: "queued" }))
      .mockResolvedValueOnce(Response.json({ attemptId: "attempt-1", status: "queued" }));
    const client = clientWith(fetchMock);

    await expect(
      client.memory.entries.createImportUpload("acme", "memory-1", {
        format: "tmx",
        sourceFilename: "memory.tmx",
        contentType: "application/xml",
      }),
    ).resolves.toMatchObject({ attemptId: "attempt-1", status: "upload_pending" });
    await expect(
      client.memory.entries.queueImport("acme", "memory-1", {
        attemptId: "attempt-1",
        mode: "apply",
      }),
    ).resolves.toMatchObject({ attemptId: "attempt-1", status: "queued" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/translation-memories/memory-1/entries/import/uploads`,
    );
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(fetchMock.mock.calls[1][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/translation-memories/memory-1/entries/import`,
    );
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe("POST");
  });

  it("cancels a stale memory import upload session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ attemptId: "attempt-1", status: "failed" }));
    const client = clientWith(fetchMock);

    await expect(
      client.memory.entries.cancelImport("acme", "memory-1", { attemptId: "attempt-1" }),
    ).resolves.toMatchObject({ attemptId: "attempt-1", status: "failed" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/translation-memories/memory-1/entries/import`,
    );
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({
      attemptId: "attempt-1",
      mode: "cancel",
    });
  });

  it("rejects invalid base URLs and non-absolute paths", async () => {
    expect(
      () =>
        new GoSvcClient({
          getAccessToken: () => "access-token",
          baseUrl: "ftp://api.example.com",
        }),
    ).toThrow(TypeError);

    const fetchMock = vi.fn();
    const request = new GoSvcRequest({
      getAccessToken: () => "access-token",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(request.json("v1/orgs/acme/teams")).rejects.toThrow(TypeError);
    await expect(request.json("//evil.example/v1/orgs/acme/teams")).rejects.toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rethrows abort errors without wrapping them as network failures", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    const request = new GoSvcRequest({
      getAccessToken: () => "access-token",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(request.json("/v1/orgs/acme/teams")).rejects.toBe(abortError);
  });

  it("loads overview project extras for selected live ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ projects: [] }));
    const client = clientWith(fetchMock);

    await client.overview.projects("acme / eu", {
      query: { id: ["ext:crowdin:oldest", "ext:crowdin:older"] },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme%20%2F%20eu/overview/projects?id=ext%3Acrowdin%3Aoldest&id=ext%3Acrowdin%3Aolder`,
    );
  });

  it("loads overview sections from dedicated go-svc routes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        metrics: {
          jobs: { count: 0, series: [0, 0, 0, 0, 0, 0, 0] },
          translations: { count: 0, series: [0, 0, 0, 0, 0, 0, 0] },
          automations: null,
          issues: { open: 0, p1: 0 },
        },
      }),
    );
    const client = clientWith(fetchMock);

    await client.overview.metrics("acme / eu");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme%20%2F%20eu/overview/metrics`);
    expect(init.method).toBe("GET");
  });

  it("deletes issue-sheet resources with encoded path segments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = clientWith(fetchMock);

    await client.issueSheet.delete("acme / eu", "project/1", "WEB-1");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme%20%2F%20eu/projects/project%2F1/issue-sheet/WEB-1`,
    );
    expect(init.method).toBe("DELETE");
  });

  it("encodes organization and issue-sheet path segments", () => {
    expect(orgPath("acme / eu", "dictionaries", "dict/1")).toBe(
      "/v1/orgs/acme%20%2F%20eu/dictionaries/dict%2F1",
    );
    expect(issueSheetPath("acme", "project/1", "issues", "ISS-1")).toBe(
      "/v1/orgs/acme/projects/project%2F1/issue-sheet/issues/ISS-1",
    );
    expect(catPath("acme / eu", "project/1", "segments", "key/1", "target")).toBe(
      "/v1/orgs/acme%20%2F%20eu/projects/project%2F1/files/detail/cat/segments/key%2F1/target",
    );
  });
});
