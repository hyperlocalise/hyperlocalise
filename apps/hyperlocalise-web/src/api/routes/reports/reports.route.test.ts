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
import "dotenv/config";

import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  workspaceReportsFlagRunMock: vi.fn(async () => true),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/flags/workspace-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags/workspace-flags")>();
  return {
    ...actual,
    workspaceReportsFlag: { run: mocks.workspaceReportsFlagRunMock },
  };
});

import { and, eq } from "drizzle-orm";

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { isOk } from "@/lib/primitives/result/results";
import { saveRateCard } from "@/lib/reporting/rate-cards";
import { createReportingTestFixture } from "@/lib/reporting/reporting.fixture";
import { ensureDefaultWorkspaceTeamMembership } from "@/lib/teams/default-workspace-team";

const app = createApp();
const fixture = createAuthTestFixture();
const reporting = createReportingTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  mocks.workspaceReportsFlagRunMock.mockResolvedValue(true);
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
  await reporting.cleanup();
});

function reportsUrl(organizationSlug: string, path = "") {
  return `http://localhost/api/orgs/${organizationSlug}/reports${path}`;
}

const rateBody = {
  name: "Default",
  sourceLocale: "en",
  targetLocale: "fr",
  step: "translation",
  basis: "word",
  rate: "0.12",
};

describe("reports routes", () => {
  it("lets localization managers read costs but not mutate rates", async () => {
    const identity = fixture.createWorkosIdentityWithRole("localization_manager");
    const headers = await fixture.authHeadersFor(identity);
    const slug = identity.organization.slug ?? "missing-slug";

    const costs = await app.request(reportsUrl(slug, "?view=costs"), { headers });
    expect(costs.status).toBe(200);

    const settings = await app.request(reportsUrl(slug, "/settings"), { headers });
    expect(settings.status).toBe(200);
    await expect(settings.json()).resolves.toMatchObject({
      settings: { financial: true, canManage: false },
    });

    const created = await app.request(reportsUrl(slug, "/rates"), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(rateBody),
    });
    expect(created.status).toBe(403);
    await expect(created.json()).resolves.toMatchObject({ error: "report_costs_forbidden" });
  });

  it("lets admins create rates", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const slug = identity.organization.slug ?? "missing-slug";

    const settings = await app.request(reportsUrl(slug, "/settings"), { headers });
    await expect(settings.json()).resolves.toMatchObject({
      settings: { financial: true, canManage: true },
    });

    const created = await app.request(reportsUrl(slug, "/rates"), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(rateBody),
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      rate: { name: "Default", step: "translation" },
    });
  });

  it("serves word count totals and the job list, as JSON and CSV", async () => {
    const identity = fixture.createWorkosIdentityWithRole("localization_manager");
    const headers = await fixture.authHeadersFor(identity);
    const slug = identity.organization.slug ?? "missing-slug";

    const totals = await app.request(reportsUrl(slug, "/word-counts?groupBy=job"), { headers });
    expect(totals.status).toBe(200);
    await expect(totals.json()).resolves.toMatchObject({
      wordCounts: { rows: [], groupBy: "job" },
    });

    const csv = await app.request(reportsUrl(slug, "/word-counts?format=csv"), { headers });
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect((await csv.text()).split("\r\n")[0]).toContain("analysedWords");

    const jobs = await app.request(reportsUrl(slug, "/jobs"), { headers });
    await expect(jobs.json()).resolves.toEqual({ jobs: [] });

    const missing = await app.request(reportsUrl(slug, "/tasks/job_missing/match-analysis"), {
      headers,
    });
    expect(missing.status).toBe(404);

    const invalid = await app.request(reportsUrl(slug, "/word-counts?groupBy=person"), {
      headers,
    });
    expect(invalid.status).toBe(400);
  });

  it("serves each section of the Reports page in its own envelope", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const slug = identity.organization.slug ?? "missing-slug";
    const read = async (path: string) => {
      const response = await app.request(reportsUrl(slug, path), { headers });
      expect(response.status, path).toBe(200);
      return response.json();
    };

    await expect(read("/settings")).resolves.toMatchObject({
      settings: {
        startedAt: null,
        canLogTime: true,
        rateCardNames: [],
        summary: { pendingDays: 0 },
      },
    });
    await expect(read("/activity?from=2026-06-01&to=2026-06-07")).resolves.toMatchObject({
      activity: {
        period: { from: "2026-06-01", to: "2026-06-07", days: 7, hasEarlierData: false },
        current: { arrived: 0 },
        previous: { arrived: 0 },
        series: expect.any(Array),
        byLanguage: [],
      },
    });
    await expect(read("/step-times")).resolves.toMatchObject({
      stepTimes: { logged: [], automated: { workflowSteps: [] } },
    });
    await expect(read("/ai-usage")).resolves.toMatchObject({ aiUsage: { byOrigin: [] } });
    await expect(read("/words?groupBy=task&unit=characters")).resolves.toMatchObject({
      wordCounts: { rows: [], groupBy: "task", unit: "characters", mode: "arrived" },
    });
    await expect(read("/time")).resolves.toMatchObject({ time: { logged: { rows: [] } } });
    await expect(read("/costs")).resolves.toMatchObject({
      costs: {
        rows: [],
        outsideProjects: { aiUsd: "0.00000000" },
        totals: { totalUsd: "0.00000000" },
      },
    });
    await expect(read("/cost-estimate?jobIds=job_a,job_b")).resolves.toMatchObject({
      costEstimate: { rows: [], fixedFees: [] },
    });
    await expect(read("/budgets")).resolves.toEqual({ budgets: [] });
    await expect(read("/rate-cards")).resolves.toEqual({ rateCards: [], canManage: true });

    const csv = await app.request(reportsUrl(slug, "/words?groupBy=task&format=csv"), { headers });
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(csv.headers.get("content-disposition")).toContain("word-counts.csv");
    expect((await csv.text()).split("\r\n")[0]).toBe(
      '"projectName","jobTitle","jobId","targetLocale","total"',
    );
    // AI charged outside any project is a row with no project.
    const costs = await app.request(reportsUrl(slug, "/costs?format=csv"), { headers });
    expect((await costs.text()).split("\r\n")).toEqual([
      '"projectName","projectId","peopleUsd","aiOnTasksUsd","aiOutsideTasksUsd","aiUsd","expensesUsd","totalUsd"',
      '"","","","0.00000000","0.00000000","0.00000000","","0.00000000"',
    ]);
  });

  it("rejects malformed queries", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const slug = identity.organization.slug ?? "missing-slug";
    const tooManyTasks = Array.from({ length: 51 }, (_, index) => `job_${index}`).join(",");
    for (const path of [
      "/words?unit=pages",
      "/activity?from=2026-06-10&to=2026-06-01",
      `/cost-estimate?jobIds=${tooManyTasks}`,
      "/cost-estimate",
      "/time?page=0",
      "/activity?from=0000-01-01&to=0000-01-02",
    ]) {
      const response = await app.request(reportsUrl(slug, path), { headers });
      expect(response.status, path).toBe(400);
    }
  });

  it.each(["member", "translator"] as const)(
    "keeps money from a %s and still shows activity",
    async (role) => {
      const identity = fixture.createWorkosIdentityWithRole(role);
      const headers = await fixture.authHeadersFor(identity);
      const slug = identity.organization.slug ?? "missing-slug";
      for (const path of ["/costs", "/cost-estimate", "/budgets", "/rate-cards"]) {
        const response = await app.request(reportsUrl(slug, path), { headers });
        expect(response.status, path).toBe(403);
      }
      const activity = await app.request(reportsUrl(slug, "/activity"), { headers });
      expect(activity.status).toBe(200);
      const settings = await app.request(reportsUrl(slug, "/settings"), { headers });
      await expect(settings.json()).resolves.toMatchObject({
        settings: { financial: false, canLogTime: role === "translator" },
      });
    },
  );

  it("lets only admins save rate cards, once per name", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const slug = admin.organization.slug ?? "missing-slug";
    const manager = fixture.createWorkosIdentityForOrganization(
      admin.organization,
      "localization_manager",
    );
    const card = {
      name: "Standard 2026",
      defaultBasis: "character",
      lines: [
        { ...rateBody, targetLocale: "ja-JP", basis: "character", rate: "0.02" },
        { ...rateBody, basis: "character_with_spaces", rate: "0.015" },
      ],
      create: true,
    };
    const put = async (identity: typeof admin, body: unknown) =>
      app.request(reportsUrl(slug, "/rate-cards"), {
        method: "PUT",
        headers: {
          ...(await fixture.authHeadersFor(identity)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

    expect((await put(manager, card)).status).toBe(403);
    const created = await put(admin, card);
    expect(created.status).toBe(200);
    await expect(created.json()).resolves.toMatchObject({
      rateCard: { name: "Standard 2026", defaultBasis: "character", lines: [{}, {}] },
    });
    const again = await put(admin, card);
    expect(again.status).toBe(409);
    await expect(again.json()).resolves.toMatchObject({ error: "rate_card_exists" });
    expect((await put(admin, { ...card, name: "Other", create: false })).status).toBe(404);
    expect((await put(admin, { ...card, lines: [card.lines[0], card.lines[0]] })).status).toBe(400);
    const malformed = await put(admin, { ...card, name: "" });
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ error: "invalid_rate_card" });

    const managerHeaders = await fixture.authHeadersFor(manager);
    const listed = await app.request(reportsUrl(slug, "/rate-cards"), { headers: managerHeaders });
    await expect(listed.json()).resolves.toMatchObject({
      rateCards: [{ name: "Standard 2026" }],
      canManage: false,
    });
  });

  it("reports one task's words, money and time, and hides a task the viewer cannot open", async () => {
    const workspace = await reporting.createWorkspace();
    const { identity, organization, user, project, createJob, addSummary } = workspace;
    const headers = await reporting.authHeadersFor(identity);
    const slug = identity.organization.slug ?? "missing-slug";
    const job = await createJob({ title: "Release strings", assigned: true });
    const saved = await saveRateCard({
      organizationId: organization.id,
      actorId: user.id,
      name: "Standard",
      defaultBasis: "word",
      lines: [
        {
          ...rateBody,
          sourceLocale: "en-US",
          targetLocale: "fr-FR",
          step: "translation",
          basis: "word",
          rate: "0.5",
          percentages: {},
        },
      ],
      create: true,
    });
    expect(isOk(saved)).toBe(true);
    await addSummary([
      {
        jobId: job.id,
        targetLocale: "fr-FR",
        day: "2026-06-01",
        source: 10,
        arrived: { words: 10, strings: 2 },
        arrivedDone: { words: 4, strings: 1 },
      },
      {
        jobId: job.id,
        targetLocale: "fr-FR",
        step: "review",
        day: "2026-06-02",
        arrived: 10,
        arrivedDone: 2,
      },
    ]);
    await db.insert(schema.reportingTimeEntries).values({
      organizationId: organization.id,
      projectId: project.id,
      jobId: job.id,
      contributorId: user.id,
      step: "translation",
      targetLocale: "fr-FR",
      workDate: new Date("2026-06-01T00:00:00Z"),
      minutes: 45,
    });

    const response = await app.request(
      reportsUrl(slug, `/tasks/${job.id}/report?rateCard=Standard`),
      { headers },
    );
    expect(response.status).toBe(200);
    const { taskReport } = await response.json();
    expect(taskReport).toMatchObject({
      task: { id: job.id, title: "Release strings", status: "running" },
      words: {
        totals: {
          translation: { source: 10, arrived: 10, arrivedDone: 4 },
          review: { arrivedDone: 2 },
        },
      },
      estimate: { totals: { costUsd: "5.00000000" } },
      stillToCome: { amountUsd: "3.00000000", incomplete: false },
      time: { minutes: 45, people: 1, entries: [{ minutes: 45, own: true, canEdit: true }] },
    });

    const missing = await app.request(reportsUrl(slug, "/tasks/job_missing/report"), { headers });
    expect(missing.status).toBe(404);
  });

  it("prices logged time only by an hourly line, never by a per-character one", async () => {
    const workspace = await reporting.createWorkspace();
    const { identity, organization, user, project, createJob } = workspace;
    const headers = {
      ...(await reporting.authHeadersFor(identity)),
      "Content-Type": "application/json",
    };
    const slug = identity.organization.slug ?? "missing-slug";
    const job = await createJob();
    const card = await saveRateCard({
      organizationId: organization.id,
      actorId: user.id,
      name: "Mixed",
      defaultBasis: "character",
      lines: [
        {
          sourceLocale: "en-US",
          targetLocale: "ja-JP",
          step: "translation",
          basis: "character",
          rate: "0.02",
          percentages: {},
        },
        {
          sourceLocale: "en-US",
          targetLocale: "de-DE",
          step: "translation",
          basis: "hour",
          rate: "60",
          percentages: {},
        },
      ],
      create: true,
    });
    if (!isOk(card)) throw new Error("expected the card to save");
    await db.insert(schema.reportingBudgets).values({
      organizationId: organization.id,
      projectId: project.id,
      budget: "1000",
      rateCardName: "Mixed",
    });
    const log = (targetLocale: string) =>
      app.request(reportsUrl(slug, "/time-entries"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          jobId: job.id,
          step: "translation",
          targetLocale,
          workDate: "2026-06-01",
          minutes: 30,
        }),
      });
    expect((await log("ja-JP")).status).toBe(201);
    expect((await log("de-DE")).status).toBe(201);
    const costs = await db
      .select({
        amountUsd: schema.reportingCosts.amountUsd,
        locale: schema.reportingCosts.targetLocale,
      })
      .from(schema.reportingCosts)
      .where(
        and(
          eq(schema.reportingCosts.organizationId, organization.id),
          eq(schema.reportingCosts.kind, "human"),
        ),
      );
    expect(costs).toEqual([{ amountUsd: "30.00000000", locale: "de-DE" }]);
  });

  it("refuses retired rate lines and unknown rate cards for tasks and budgets", async () => {
    const workspace = await reporting.createWorkspace();
    const { identity, organization, user, project, createJob } = workspace;
    const headers = {
      ...(await reporting.authHeadersFor(identity)),
      "Content-Type": "application/json",
    };
    const slug = identity.organization.slug ?? "missing-slug";
    const job = await createJob({ status: "queued" });
    const fr = {
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      step: "translation" as const,
      basis: "word" as const,
      percentages: {},
    };
    const first = await saveRateCard({
      organizationId: organization.id,
      actorId: user.id,
      name: "Standard",
      defaultBasis: "word",
      lines: [{ ...fr, rate: "0.10" }],
      create: true,
    });
    const second = await saveRateCard({
      organizationId: organization.id,
      actorId: user.id,
      name: "Standard",
      defaultBasis: "word",
      lines: [{ ...fr, rate: "0.12" }],
      create: false,
    });
    if (!isOk(first) || !isOk(second)) throw new Error("expected the card to save");
    const taskRate = (rateId: string) =>
      app.request(reportsUrl(slug, "/task-rates"), {
        method: "PUT",
        headers,
        body: JSON.stringify({ jobId: job.id, step: "translation", rateId }),
      });
    const old = await taskRate(first.value.lines[0].id);
    expect(old.status).toBe(400);
    await expect(old.json()).resolves.toMatchObject({ error: "invalid_rate" });
    // The old Reports page sends a line: the task takes the line's card.
    const legacy = await taskRate(second.value.lines[0].id);
    expect(legacy.status).toBe(200);
    await expect(legacy.json()).resolves.toMatchObject({
      taskRate: { rateCardName: "Standard", rateId: null, pricedAt: expect.any(String) },
    });
    const taskCard = (rateCardName: string) =>
      app.request(reportsUrl(slug, "/task-rates"), {
        method: "PUT",
        headers,
        body: JSON.stringify({ jobId: job.id, step: "translation", rateCardName }),
      });
    const missingCard = await taskCard("Nope");
    expect(missingCard.status).toBe(400);
    await expect(missingCard.json()).resolves.toMatchObject({ error: "rate_card_not_found" });
    expect((await taskCard("Standard")).status).toBe(200);

    const budget = (rateCardName: string) =>
      app.request(reportsUrl(slug, "/budgets"), {
        method: "PUT",
        headers,
        body: JSON.stringify({ projectId: project.id, budget: "500", rateCardName }),
      });
    const unknown = await budget("Nope");
    expect(unknown.status).toBe(400);
    await expect(unknown.json()).resolves.toMatchObject({ error: "rate_card_not_found" });
    // An empty name is no card; "no rate card" is sent as null.
    const blank = await budget("");
    expect(blank.status).toBe(400);
    await expect(blank.json()).resolves.toMatchObject({ error: "invalid_budget" });
    expect((await budget("Standard")).status).toBe(200);
  });

  it("shows a viewer only the projects their teams can open, and money and workspace-wide work only to billing roles", async () => {
    const workspace = await reporting.createWorkspace();
    const { identity, organization, user, project, createProject, createJob, addSummary } =
      workspace;
    const [secretTeam] = await db
      .insert(schema.teams)
      .values({ organizationId: organization.id, slug: "secret", name: "Secret" })
      .returning();
    const secret = await createProject("Secret", secretTeam!.id);
    const translatorIdentity = reporting.createWorkosIdentityForOrganization(
      identity.organization,
      "translator",
    );
    const { user: translator } = await reporting.createLocalWorkosIdentity(translatorIdentity);
    await ensureDefaultWorkspaceTeamMembership({
      organizationId: organization.id,
      userId: translator.id,
    });
    const today = new Date().toISOString().slice(0, 10);
    const job = await createJob({ title: "Release strings" });
    await addSummary([
      { jobId: job.id, targetLocale: "fr-FR", day: today, arrived: 10 },
      { projectId: secret.id, targetLocale: "fr-FR", day: today, arrived: 99 },
    ]);
    // AI used outside any project, and a workflow outside any project.
    await db.insert(schema.usageEvents).values({
      organizationId: organization.id,
      featureId: "ai_tokens",
      status: "tracking_succeeded",
      operationKey: `test:${randomUUID()}`,
      source: "chat_agent_turn",
      dimensions: { input_tokens: 100, output_tokens: 10 },
    });
    const [workflow] = await db
      .insert(schema.visualWorkflows)
      .values({ organizationId: organization.id, name: "Workspace-wide" })
      .returning();
    const [run] = await db
      .insert(schema.visualWorkflowRuns)
      .values({
        organizationId: organization.id,
        visualWorkflowId: workflow!.id,
        triggerSource: "manual",
      })
      .returning();
    await db.insert(schema.visualWorkflowNodeRuns).values({
      organizationId: organization.id,
      runId: run!.id,
      nodeId: "http",
      nodeType: "action.http",
      status: "succeeded",
      startedAt: new Date(),
      finishedAt: new Date(),
    });
    // Someone else's time on the task.
    await db.insert(schema.reportingTimeEntries).values({
      organizationId: organization.id,
      projectId: project.id,
      jobId: job.id,
      contributorId: user.id,
      step: "translation",
      targetLocale: "fr-FR",
      workDate: new Date(`${today}T00:00:00Z`),
      minutes: 30,
    });
    const slug = identity.organization.slug ?? "missing-slug";
    const read = async (headers: Record<string, string>, path: string) => {
      const response = await app.request(reportsUrl(slug, path), { headers });
      expect(response.status, path).toBe(200);
      return response.json();
    };
    const admin = await reporting.authHeadersFor(identity);
    const viewer = await reporting.authHeadersFor(translatorIdentity);

    const adminWords = await read(admin, "/words");
    expect(adminWords.wordCounts.total).toBe(109);
    const viewerWords = await read(viewer, "/words");
    expect(
      viewerWords.wordCounts.rows.map((row: { projectName: string }) => row.projectName),
    ).toEqual(["Docs"]);
    expect((await read(viewer, `/words?projectId=${secret.id}`)).wordCounts.rows).toEqual([]);
    expect((await read(viewer, `/activity?projectId=${secret.id}`)).activity.current.arrived).toBe(
      0,
    );

    expect((await read(admin, "/ai-usage")).aiUsage.totals.calls).toBe(1);
    expect((await read(viewer, "/ai-usage")).aiUsage.totals.calls).toBe(0);
    expect((await read(admin, "/step-times")).stepTimes.automated.workflowSteps).toHaveLength(1);
    expect((await read(viewer, "/step-times")).stepTimes.automated.workflowSteps).toEqual([]);

    const report = await read(viewer, `/tasks/${job.id}/report`);
    expect(report.taskReport).toMatchObject({
      estimate: null,
      stillToCome: null,
      time: { minutes: 30, people: 1, entries: [] },
      canLogTime: true,
    });
  });

  it("narrows budgets to one project, and to none for a project the viewer has not got", async () => {
    const workspace = await reporting.createWorkspace();
    const { identity, organization, project, createProject } = workspace;
    const other = await createProject("Help centre");
    await db.insert(schema.reportingBudgets).values(
      [project.id, other.id].map((projectId) => ({
        organizationId: organization.id,
        projectId,
        budget: "100",
      })),
    );
    const headers = await reporting.authHeadersFor(identity);
    const slug = identity.organization.slug ?? "missing-slug";
    const names = async (path: string) => {
      const response = await app.request(reportsUrl(slug, path), { headers });
      expect(response.status, path).toBe(200);
      const body = (await response.json()) as { budgets: { projectName: string }[] };
      return body.budgets.map((row) => row.projectName);
    };
    await expect(names("/budgets")).resolves.toEqual(["Docs", "Help centre"]);
    await expect(names(`/budgets?projectId=${other.id}`)).resolves.toEqual(["Help centre"]);
    await expect(names("/budgets?projectId=project_elsewhere")).resolves.toEqual([]);
  });

  it("denies report access when the feature flag is disabled", async () => {
    mocks.workspaceReportsFlagRunMock.mockResolvedValue(false);
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const slug = identity.organization.slug ?? "missing-slug";

    const response = await app.request(reportsUrl(slug), { headers });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "feature_unavailable",
    });
  });
});
