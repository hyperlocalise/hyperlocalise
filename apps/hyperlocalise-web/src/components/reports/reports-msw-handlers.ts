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
import { delay, http, HttpResponse } from "msw";

import {
  createReportsSettings,
  createReportsTaskWordCounts,
  reportsResponseBodies,
  type ReportsEndpoint,
} from "./reports.fixture";

type ReportsHandlerOptions = {
  settings?: ReturnType<typeof createReportsSettings>;
  /** Never answer, to show the loading state. */
  wait?: "infinite";
  /** Endpoints that fail with a server error. */
  failing?: ReportsEndpoint[];
};

const GET_ENDPOINTS: ReportsEndpoint[] = [
  "settings",
  "activity",
  "step-times",
  "ai-usage",
  "words",
  "time",
  "costs",
  "cost-estimate",
  "budgets",
  "rate-cards",
  "jobs",
];

/** Storybook handlers for the Reports page's endpoints, answering with `reports.fixture.ts`. */
export function createReportsMswHandlers({
  settings = createReportsSettings(),
  wait,
  failing = [],
}: ReportsHandlerOptions = {}) {
  const bodies = reportsResponseBodies(settings);
  return [
    ...GET_ENDPOINTS.map((endpoint) =>
      http.get(`*/api/orgs/:organizationSlug/reports/${endpoint}`, async ({ request }) => {
        if (wait) await delay("infinite");
        if (failing.includes(endpoint))
          return HttpResponse.json({ error: "report_failed" }, { status: 500 });
        const query = new URL(request.url).searchParams;
        if (endpoint === "words" && query.get("groupBy") === "task")
          return HttpResponse.json({
            wordCounts: {
              unit: query.get("unit") ?? "words",
              step: "translation",
              mode: query.get("mode") ?? "arrived",
              groupBy: "task",
              ...createReportsTaskWordCounts(),
            },
          });
        return HttpResponse.json(bodies[endpoint]);
      }),
    ),
    http.put("*/api/orgs/:organizationSlug/reports/rate-cards", async ({ request }) => {
      const body = (await request.json()) as {
        name: string;
        defaultBasis: string;
        lines: unknown[];
      };
      return HttpResponse.json({ rateCard: { ...body, lines: body.lines } });
    }),
    http.post("*/api/orgs/:organizationSlug/reports/time-entries", () =>
      HttpResponse.json({ timeEntry: { id: "time_new" } }, { status: 201 }),
    ),
    http.put("*/api/orgs/:organizationSlug/reports/budgets", () =>
      HttpResponse.json({ budget: {} }),
    ),
    http.get("*/api/orgs/:organizationSlug/reports/tasks/:jobId/analysis", () =>
      HttpResponse.json(bodies["task-analysis"]),
    ),
    http.get("*/api/orgs/:organizationSlug/reports/tasks/:jobId/report", async () => {
      if (wait) await delay("infinite");
      if (failing.includes("task-report"))
        return HttpResponse.json({ error: "report_failed" }, { status: 500 });
      return HttpResponse.json(bodies["task-report"]);
    }),
    http.put("*/api/orgs/:organizationSlug/reports/task-rates", () =>
      HttpResponse.json(bodies["task-rates"]),
    ),
    http.patch("*/api/orgs/:organizationSlug/reports/time-entries/:id", ({ params }) =>
      HttpResponse.json({ timeEntry: { id: params.id } }),
    ),
    http.delete(
      "*/api/orgs/:organizationSlug/reports/time-entries/:id",
      () => new HttpResponse(null, { status: 204 }),
    ),
  ];
}

export const reportsMswHandlers = createReportsMswHandlers();
export const reportsMemberMswHandlers = createReportsMswHandlers({
  settings: createReportsSettings({ financial: false, canManage: false }),
});
export const reportsLoadingMswHandlers = createReportsMswHandlers({ wait: "infinite" });
export const reportsActivityErrorMswHandlers = createReportsMswHandlers({
  failing: ["activity", "step-times", "ai-usage"],
});
