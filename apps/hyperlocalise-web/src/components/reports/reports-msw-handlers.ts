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
      http.get(`*/api/orgs/:organizationSlug/reports/${endpoint}`, async () => {
        if (wait) await delay("infinite");
        if (failing.includes(endpoint))
          return HttpResponse.json({ error: "report_failed" }, { status: 500 });
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
    http.post("*/api/orgs/:organizationSlug/reports/expenses", () =>
      HttpResponse.json({ expense: null }, { status: 201 }),
    ),
    http.put("*/api/orgs/:organizationSlug/reports/budgets", () =>
      HttpResponse.json({ budget: {} }),
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
