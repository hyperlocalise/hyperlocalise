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

import { DEFAULT_GO_SVC_BASE_URL, GoSvcClient } from "@/lib/go-svc/go-svc-client";

import { createProjectQaReportClient, createWorkspaceQaReportClient } from "./qa-report-client";

function createTestClients(fetchMock: ReturnType<typeof vi.fn>) {
  const client = new GoSvcClient({
    getAccessToken: () => "access-token",
    fetch: fetchMock as unknown as typeof fetch,
  });
  return {
    project: createProjectQaReportClient(client),
    workspace: createWorkspaceQaReportClient(client),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("createWorkspaceQaReportClient", () => {
  it("lists workspace reports from go-svc", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"reports":[]}'));
    const { workspace } = createTestClients(fetchMock);
    await workspace.listReports({ param: { organizationSlug: "acme" } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/qa-reports`);
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("omit");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-token");
  });

  it("encodes findings query parameters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"findings":[],"total":0,"limit":50,"offset":0}'));
    const { workspace } = createTestClients(fetchMock);
    await workspace.listFindings({
      param: { organizationSlug: "acme" },
      query: {
        projectId: "project/a",
        locale: "de-DE",
        checkType: "not_localized",
        limit: "50",
        offset: "0",
      },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/qa-reports/findings?limit=50&offset=0&projectId=project%2Fa&locale=de-DE&checkType=not_localized`,
    );
  });

  it("posts promote payloads to go-svc", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"results":[]}'));
    const { workspace } = createTestClients(fetchMock);
    await workspace.promoteFindings({
      param: { organizationSlug: "acme" },
      json: { findingIds: ["00000000-0000-4000-8000-000000000001"] },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/qa-reports/findings/promote`);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(init.body).toBe('{"findingIds":["00000000-0000-4000-8000-000000000001"]}');
  });
});

describe("createProjectQaReportClient", () => {
  it("loads project QA reports from go-svc", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"reports":[],"settings":{}}'));
    const { project } = createTestClients(fetchMock);
    await project.listReports({
      param: { organizationSlug: "acme", projectId: "project/a" },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/projects/project%2Fa/qa-reports`);
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("omit");
  });
});
