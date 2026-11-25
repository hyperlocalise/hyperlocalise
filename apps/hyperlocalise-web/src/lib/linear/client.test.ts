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

import { isErr, isOk } from "@/lib/primitives/result/results";

import { createLinearClient } from "./client";
import { LINEAR_GRAPHQL_URL } from "./constants";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createLinearClient", () => {
  it("rejects an empty access token", () => {
    expect(() => createLinearClient({ accessToken: "   " })).toThrow(
      "invalid_linear_oauth_credentials",
    );
  });

  it("sends a bearer token to the GraphQL endpoint and returns the viewer", async () => {
    const viewer = {
      id: "u1",
      name: "Ada",
      organization: { id: "o1", name: "Acme", urlKey: "acme" },
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: { viewer } }));
    const client = createLinearClient({ accessToken: " token_1 ", fetchImpl });

    const result = await client.getViewer();

    expect(isOk(result) && result.value).toEqual(viewer);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(LINEAR_GRAPHQL_URL);
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token_1");
    expect(init?.method).toBe("POST");
  });

  it("follows team pagination cursors", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            teams: {
              nodes: [{ id: "t1", key: "ENG", name: "Engineering" }],
              pageInfo: { hasNextPage: true, endCursor: "c1" },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            teams: {
              nodes: [{ id: "t2", key: "LOC", name: "Localisation" }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }),
      );
    const client = createLinearClient({ accessToken: "token", fetchImpl });

    const result = await client.listTeams();

    expect(isOk(result) && result.value.map((team) => team.key)).toEqual(["ENG", "LOC"]);
    const secondBody = JSON.parse(fetchImpl.mock.calls[1]![1]?.body as string);
    expect(secondBody.variables.after).toBe("c1");
  });

  it("returns the created issue", async () => {
    const issue = { id: "i1", identifier: "LOC-1", title: "Fix", url: "https://linear.app/x" };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: { issueCreate: { success: true, issue } } }));
    const client = createLinearClient({ accessToken: "token", fetchImpl });

    const result = await client.createIssue({ teamId: "t1", title: "Fix" });

    expect(isOk(result) && result.value).toEqual(issue);
    const body = JSON.parse(fetchImpl.mock.calls[0]![1]?.body as string);
    expect(body.variables.input).toEqual({ teamId: "t1", title: "Fix" });
  });

  it("fails when Linear reports the issue was not created", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: { issueCreate: { success: false, issue: null } } }));
    const client = createLinearClient({ accessToken: "token", fetchImpl });

    const result = await client.createIssue({ teamId: "t1", title: "Fix" });

    expect(isErr(result) && result.error.code).toBe("linear_request_failed");
  });

  it("maps authentication errors to invalid credentials", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          errors: [
            { message: "Authentication required", extensions: { code: "AUTHENTICATION_ERROR" } },
          ],
        },
        401,
      ),
    );
    const client = createLinearClient({ accessToken: "token", fetchImpl });

    const result = await client.getViewer();

    expect(isErr(result) && result.error).toMatchObject({
      code: "linear_credentials_invalid",
      statusCode: 401,
    });
  });

  it("maps rate limits", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ errors: [{ message: "Slow down", extensions: { code: "RATELIMITED" } }] }),
      );
    const client = createLinearClient({ accessToken: "token", fetchImpl });

    const result = await client.getViewer();

    expect(isErr(result) && result.error.code).toBe("linear_rate_limited");
  });

  it("maps network failures to a request failure", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const client = createLinearClient({ accessToken: "token", fetchImpl });

    const result = await client.getViewer();

    expect(isErr(result) && result.error.code).toBe("linear_request_failed");
  });
});
