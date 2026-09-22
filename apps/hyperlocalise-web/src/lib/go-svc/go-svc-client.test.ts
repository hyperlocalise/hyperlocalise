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

  it("accepts successful empty responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = clientWith(fetchMock);

    await expect(client.team.delete("acme", "team-1")).resolves.toBeUndefined();
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
    expect(await result.blob.text()).toBe("Brand\n");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/dictionaries/dictionary%2F1/words/export?locale=en-US`,
    );
    expect(init.signal).toBe(controller.signal);
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
});
