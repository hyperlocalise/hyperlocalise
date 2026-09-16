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

import { projectQaReportClient, workspaceQaReportClient } from "./qa-report-client";

afterEach(() => vi.unstubAllGlobals());

describe("workspaceQaReportClient", () => {
  it("lists workspace reports from go-svc", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"reports":[]}'));
    vi.stubGlobal("fetch", fetchMock);
    await workspaceQaReportClient.listReports({ param: { organizationSlug: "acme" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/go-svc/v1/orgs/acme/qa-reports", {
      method: "GET",
      credentials: "same-origin",
    });
  });

  it("encodes findings query parameters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"findings":[],"total":0,"limit":50,"offset":0}'));
    vi.stubGlobal("fetch", fetchMock);
    await workspaceQaReportClient.listFindings({
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
      "/api/go-svc/v1/orgs/acme/qa-reports/findings?projectId=project%2Fa&locale=de-DE&checkType=not_localized&limit=50&offset=0",
    );
  });

  it("posts promote payloads to go-svc", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"results":[]}'));
    vi.stubGlobal("fetch", fetchMock);
    await workspaceQaReportClient.promoteFindings({
      param: { organizationSlug: "acme" },
      json: { findingIds: ["00000000-0000-4000-8000-000000000001"] },
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/go-svc/v1/orgs/acme/qa-reports/findings/promote", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: '{"findingIds":["00000000-0000-4000-8000-000000000001"]}',
    });
  });
});

describe("projectQaReportClient", () => {
  it("loads project QA reports from go-svc", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"reports":[],"settings":{}}'));
    vi.stubGlobal("fetch", fetchMock);
    await projectQaReportClient.listReports({
      param: { organizationSlug: "acme", projectId: "project/a" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/go-svc/v1/orgs/acme/projects/project%2Fa/qa-reports",
      {
        method: "GET",
        credentials: "same-origin",
      },
    );
  });
});
