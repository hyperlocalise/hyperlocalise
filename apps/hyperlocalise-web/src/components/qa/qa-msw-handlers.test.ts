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
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test";
import { setupServer } from "msw/node";

import { qaWorkspaceLoadMoreMswHandlers, qaWorkspaceMswHandlers } from "./qa-msw-handlers";

const server = setupServer(...qaWorkspaceMswHandlers);

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe("QA Storybook handlers", () => {
  it("returns the workspace portfolio and only open findings", async () => {
    const reports = await fetch("https://api.hyperlocalise.com/v1/orgs/acme/qa-reports");
    expect(reports.ok).toBe(true);
    const reportBody = (await reports.json()) as {
      reports: Array<{ projectName: string; report: { status: string } | null }>;
    };
    expect(reportBody.reports.map((row) => row.projectName)).toEqual([
      "Website localization",
      "Mobile app",
      "Help center",
      "Release notes",
    ]);
    expect(reportBody.reports[2]?.report).toBeNull();

    const findings = await fetch(
      "https://api.hyperlocalise.com/v1/orgs/acme/qa-reports/findings?status=open&limit=50&offset=0",
    );
    const findingBody = (await findings.json()) as {
      findings: Array<{ key: string }>;
      total: number;
    };
    expect(findingBody.total).toBe(4);
    expect(findingBody.findings.map((finding) => finding.key)).toEqual([
      "dashboard.reviews.pending",
      "checkout.pay_now",
      "home.hero.title",
      "auth.sign_in",
    ]);
  });

  it("keeps an ignored finding out of the open list", async () => {
    const review = await fetch(
      "https://api.hyperlocalise.com/v1/orgs/acme/qa-reports/findings/finding_placeholder",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ignored", reason: "False positive" }),
      },
    );
    expect(review.ok).toBe(true);

    const findings = await fetch(
      "https://api.hyperlocalise.com/v1/orgs/acme/qa-reports/findings?status=open&limit=50&offset=0",
    );
    const body = (await findings.json()) as { findings: Array<{ key: string }> };
    expect(body.findings.map((finding) => finding.key)).not.toContain("dashboard.reviews.pending");
  });

  it("pages findings and promotes the selected ids", async () => {
    server.use(...qaWorkspaceLoadMoreMswHandlers);
    const first = await fetch(
      "https://api.hyperlocalise.com/v1/orgs/acme/qa-reports/findings?status=open&limit=50&offset=0",
    );
    const firstBody = (await first.json()) as { findings: Array<{ id: string }>; total: number };
    expect(firstBody.total).toBe(4);
    expect(firstBody.findings).toHaveLength(1);

    const promoted = await fetch(
      "https://api.hyperlocalise.com/v1/orgs/acme/qa-reports/findings/promote",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingIds: [firstBody.findings[0]?.id] }),
      },
    );
    const promotedBody = (await promoted.json()) as {
      results: Array<{ identifier: string }>;
    };
    expect(promotedBody.results[0]?.identifier).toBe("WEB-21");
  });
});
