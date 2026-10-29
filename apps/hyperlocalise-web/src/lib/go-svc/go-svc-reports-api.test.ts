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
"use client";
import { describe, expect, it, vi } from "vite-plus/test";

import { GoSvcReportsApi } from "./go-svc-reports-api";
import { DEFAULT_GO_SVC_BASE_URL, GoSvcClientError, GoSvcRequest } from "./go-svc-request";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function reportsApi(fetchMock: ReturnType<typeof vi.fn>, service = false) {
  return new GoSvcReportsApi(
    new GoSvcRequest({
      ...(service ? { getServiceToken: () => "svc-token" } : { getAccessToken: () => "token" }),
      fetch: fetchMock as unknown as typeof fetch,
    }),
  );
}

const base = `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/reports`;

function calledWith(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return { url, init, headers: new Headers(init.headers) };
}

describe("GoSvcReportsApi", () => {
  it("reads each section from its route, with the page's query, and unwraps the answer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ settings: { today: "2026-10-21" } }))
      .mockResolvedValueOnce(json({ activity: { current: { arrived: 3 } } }))
      .mockResolvedValueOnce(json({ wordSeries: { points: [] } }))
      .mockResolvedValueOnce(json({ taskReport: { task: { id: "job_1" } } }))
      .mockResolvedValueOnce(json({ rateCards: [], canManage: true }));
    const api = reportsApi(fetchMock);

    await expect(api.settings("acme")).resolves.toEqual({ today: "2026-10-21" });
    await expect(
      api.activity("acme", { from: "2026-09-24", to: "2026-10-21", step: "review" }),
    ).resolves.toEqual({ current: { arrived: 3 } });
    await expect(api.wordSeries("acme", { split: "band" })).resolves.toEqual({ points: [] });
    await expect(api.taskReport("acme", "job 1", { unit: "words" })).resolves.toEqual({
      task: { id: "job_1" },
    });
    await expect(api.rateCards("acme")).resolves.toEqual({ rateCards: [], canManage: true });

    expect(calledWith(fetchMock, 0).url).toBe(`${base}/settings`);
    expect(calledWith(fetchMock, 0).headers.get("Authorization")).toBe("Bearer token");
    expect(calledWith(fetchMock, 1).url).toBe(
      `${base}/activity?from=2026-09-24&to=2026-10-21&step=review`,
    );
    expect(calledWith(fetchMock, 2).url).toBe(`${base}/words/series?split=band`);
    expect(calledWith(fetchMock, 3).url).toBe(`${base}/tasks/job%201/report?unit=words`);
    expect(calledWith(fetchMock, 4).init.method).toBe("GET");
  });

  it("downloads a section or a task's words as CSV, keeping the filename go-svc gives", async () => {
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Response("project,total\nDocs,3\n", {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="words-2026-10-21.csv"',
          },
        }),
    );
    const api = reportsApi(fetchMock);

    const file = await api.csv("acme", "words", { groupBy: "task", page: "2" });
    expect(file.filename).toBe("words-2026-10-21.csv");
    expect(await file.blob.text()).toBe("project,total\nDocs,3\n");
    expect(calledWith(fetchMock).url).toBe(`${base}/words?groupBy=task&page=2&format=csv`);

    await api.taskReportCsv("acme", "job_1", { unit: "strings", step: "review" });
    expect(calledWith(fetchMock, 1).url).toBe(
      `${base}/tasks/job_1/report?unit=strings&step=review&format=csv`,
    );
  });

  it("writes with the page's bodies and methods", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ rateCard: { name: "Standard", lines: [] } }))
      .mockResolvedValueOnce(json({ timeEntry: { id: "time_1" } }, 201))
      .mockResolvedValueOnce(json({ budget: { id: "budget_1" } }))
      .mockResolvedValueOnce(json({ taskRate: { id: "rate_1" } }))
      .mockResolvedValueOnce(json({ timeEntry: { id: "time_1" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = reportsApi(fetchMock);

    await expect(
      api.saveRateCard("acme", { name: "Standard", lines: [], create: true }),
    ).resolves.toEqual({ name: "Standard", lines: [] });
    await expect(
      api.logTime("acme", {
        jobId: "job_1",
        step: "translation",
        targetLocale: "fr-FR",
        workDate: "2026-10-20",
        minutes: 30,
      }),
    ).resolves.toEqual({ timeEntry: { id: "time_1" } });
    await api.setBudget("acme", { projectId: "proj_1", budget: "100" });
    await expect(
      api.setTaskPricing("acme", { jobId: "job_1", step: "review", overrideUsd: "10" }),
    ).resolves.toEqual({ id: "rate_1" });
    await api.editTime("acme", "time_1", { workDate: "2026-10-20", minutes: 45 });
    await expect(api.deleteTime("acme", "time_1")).resolves.toBeUndefined();

    const calls = [0, 1, 2, 3, 4, 5].map((index) => calledWith(fetchMock, index));
    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ["PUT", `${base}/rate-cards`],
      ["POST", `${base}/time-entries`],
      ["PUT", `${base}/budgets`],
      ["PUT", `${base}/task-rates`],
      ["PATCH", `${base}/time-entries/time_1`],
      ["DELETE", `${base}/time-entries/time_1`],
    ]);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      name: "Standard",
      lines: [],
      create: true,
    });
    expect(JSON.parse(calls[4].init.body as string)).toEqual({
      workDate: "2026-10-20",
      minutes: 45,
    });
    expect(calls[5].init.body).toBeUndefined();
  });

  it("passes go-svc's code and message on when a request is refused", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json({ error: "reports_busy", message: "Reports is busy; try again in a moment" }, 503),
      );
    const api = reportsApi(fetchMock);

    const failure = await api
      .costs("acme", { from: "2026-09-24", to: "2026-10-21" })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GoSvcClientError);
    expect(failure).toMatchObject({ code: "reports_busy", status: 503 });
    expect((failure as Error).message).toBe("Reports is busy; try again in a moment");
  });

  it("reads a report for a member through the internal route with the service token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        kind: "words",
        summary: { pendingDays: 0, oldestMarkedAt: null },
        stillUpdating: false,
        wordCounts: { rows: [] },
      }),
    );
    const api = reportsApi(fetchMock, true);

    await expect(
      api.internal("words", {
        organizationId: "org_1",
        userId: "user_1",
        query: { groupBy: "task", page: 2, from: "2026-09-24" },
      }),
    ).resolves.toMatchObject({ kind: "words", wordCounts: { rows: [] } });

    const call = calledWith(fetchMock);
    expect(call.url).toBe(`${DEFAULT_GO_SVC_BASE_URL}/internal/reports/words`);
    expect(call.init.method).toBe("POST");
    expect(call.headers.get("X-Go-Svc-Research-Token")).toBe("svc-token");
    expect(JSON.parse(call.init.body as string)).toEqual({
      organizationId: "org_1",
      userId: "user_1",
      query: { groupBy: "task", page: 2, from: "2026-09-24" },
    });
  });
});
