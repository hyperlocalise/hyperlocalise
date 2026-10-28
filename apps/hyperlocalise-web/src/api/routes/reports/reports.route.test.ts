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
import {
  createReportingTestFixture,
  startReportingForTest,
} from "@/lib/reporting/reporting.fixture";
import { setTaskAnalysisStatus } from "@/lib/reporting/task-analysis-status";
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

    const priced = await app.request(reportsUrl(slug, "/task-rates"), {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: "job_any", step: "translation", rateCardName: "Default" }),
    });
    expect(priced.status).toBe(403);
    await expect(priced.json()).resolves.toMatchObject({ error: "report_costs_forbidden" });
  });

  it("serves the task list, and no longer serves the old Reports page's routes", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const slug = identity.organization.slug ?? "missing-slug";

    const jobs = await app.request(reportsUrl(slug, "/jobs"), { headers });
    await expect(jobs.json()).resolves.toEqual({ jobs: [] });

    for (const [method, path] of [
      ["GET", "/word-counts"],
      ["GET", "/tasks/job_missing"],
      ["GET", "/tasks/job_missing/match-analysis"],
      ["POST", "/rates"],
    ]) {
      const response = await app.request(reportsUrl(slug, path), {
        method,
        headers: { ...headers, "Content-Type": "application/json" },
        ...(method === "POST" ? { body: JSON.stringify(rateBody) } : {}),
      });
      expect(response.status, path).toBe(404);
      // An unknown route, not a task the viewer cannot open.
      expect(await response.text(), path).not.toContain("job_not_found");
    }
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
    await expect(read("/ai-usage?groupBy=model&thenBy=area")).resolves.toMatchObject({
      aiUsage: { rows: [], groupBy: "model", thenBy: "area", totals: { calls: 0 } },
    });
    // A grouping and its second detail must differ; an unknown area is refused.
    for (const query of ["groupBy=model&thenBy=model", "area=everything"]) {
      const response = await app.request(reportsUrl(slug, `/ai-usage?${query}`), { headers });
      expect(response.status, query).toBe(400);
    }
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
    // The public endpoint serves the same reports by kind, each with its tab's own fields.
    await expect(read("")).resolves.toMatchObject({
      report: {
        kind: "activity",
        activity: { current: { arrived: 0 } },
        summary: { pendingDays: 0 },
      },
    });
    await expect(read("?report=words&groupBy=task")).resolves.toMatchObject({
      report: { kind: "words", wordCounts: { rows: [], groupBy: "task" } },
    });
    await expect(read("?report=time")).resolves.toMatchObject({
      report: { kind: "time", time: { logged: { rows: [] } } },
    });
    await expect(read("?report=costs")).resolves.toMatchObject({
      report: { kind: "costs", costs: { rows: [] } },
    });
    await expect(read("?report=ai&groupBy=task&key=own_key")).resolves.toMatchObject({
      report: { kind: "ai", aiUsage: { rows: [], groupBy: "task" } },
    });
    const aiCsv = await app.request(reportsUrl(slug, "?report=ai&groupBy=task&format=csv"), {
      headers,
    });
    expect((await aiCsv.text()).split("\r\n")[0]).toBe(
      '"jobId","jobTitle","calls","inputTokens","outputTokens","cacheAndReasoningTokens","images","videos","chargeUsd","unrecordedCharges","ownKeyCalls"',
    );
    const unknownKind = await app.request(reportsUrl(slug, "?report=budgets"), { headers });
    expect(unknownKind.status).toBe(400);
    const activityCsv = await app.request(reportsUrl(slug, "?report=activity&format=csv"), {
      headers,
    });
    expect(activityCsv.headers.get("content-disposition")).toContain("activity.csv");
    expect((await activityCsv.text()).split("\r\n")[0]).toBe(
      '"start","memory","ai","person","import","unknown"',
    );
    // One project with no tasks chosen is estimated whole (none the viewer can open: nothing).
    await expect(read("/cost-estimate?projectId=project_none")).resolves.toMatchObject({
      costEstimate: { rows: [], totals: { tasks: 0 } },
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
    "shows a %s only their own time, never the reports",
    async (role) => {
      const identity = fixture.createWorkosIdentityWithRole(role);
      const headers = await fixture.authHeadersFor(identity);
      const slug = identity.organization.slug ?? "missing-slug";
      for (const path of [
        "",
        "/activity",
        "/words",
        "/step-times",
        "/ai-usage",
        "/costs",
        "/cost-estimate",
        "/budgets",
        "/rate-cards",
      ]) {
        const response = await app.request(reportsUrl(slug, path), { headers });
        expect(response.status, path).toBe(403);
      }
      const time = await app.request(reportsUrl(slug, "/time"), { headers });
      expect(time.status).toBe(200);
      // No automated time: that is workspace activity, part of the reports they cannot see.
      await expect(time.json()).resolves.toMatchObject({ time: { automated: null } });
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

  it("tells the task's Report tab how far its analysis has got", async () => {
    const workspace = await reporting.createWorkspace();
    const { identity, organization, createJob } = workspace;
    const headers = await reporting.authHeadersFor(identity);
    const slug = identity.organization.slug ?? "missing-slug";
    const job = await createJob({ title: "Proofread strings" });
    // A task never analysed has no state.
    const none = await app.request(reportsUrl(slug, `/tasks/${job.id}/analysis`), { headers });
    await expect(none.json()).resolves.toEqual({ analysis: [] });

    await setTaskAnalysisStatus({
      organizationId: organization.id,
      jobId: job.id,
      step: "review",
      status: "pending",
    });
    await setTaskAnalysisStatus({
      organizationId: organization.id,
      jobId: job.id,
      step: "translation",
      status: "failed",
      strings: 12,
      error: "memory down",
    });
    const pending = await app.request(reportsUrl(slug, `/tasks/${job.id}/analysis`), { headers });
    expect(pending.status).toBe(200);
    await expect(pending.json()).resolves.toMatchObject({
      analysis: expect.arrayContaining([
        expect.objectContaining({
          step: "review",
          status: "pending",
          incomplete: false,
          strings: null,
          error: null,
        }),
        expect.objectContaining({
          step: "translation",
          status: "failed",
          strings: 12,
          error: "memory down",
        }),
      ]),
    });
    // The counts and failure details go with the task's words: roles without billing access see
    // only the state.
    const translator = reporting.createWorkosIdentityForOrganization(
      identity.organization,
      "translator",
    );
    const { user: person } = await reporting.createLocalWorkosIdentity(translator);
    await ensureDefaultWorkspaceTeamMembership({
      organizationId: organization.id,
      userId: person.id,
    });
    const seen = await app.request(reportsUrl(slug, `/tasks/${job.id}/analysis`), {
      headers: await reporting.authHeadersFor(translator),
    });
    expect(seen.status).toBe(200);
    const { analysis } = await seen.json();
    expect(analysis.find((row: { step: string }) => row.step === "translation")).toMatchObject({
      status: "failed",
      strings: null,
      error: null,
    });
    const missing = await app.request(reportsUrl(slug, "/tasks/job_missing/analysis"), { headers });
    expect(missing.status).toBe(404);
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
      // Time is logged on translation, so its pricing can no longer change; review's still can.
      pricing: [
        { step: "translation", rateCardName: null, locked: true },
        { step: "review", rateCardName: null, locked: false },
      ],
      canSetPricing: true,
    });

    const csv = await app.request(
      reportsUrl(slug, `/tasks/${job.id}/report?rateCard=Standard&format=csv`),
      { headers },
    );
    expect(csv.headers.get("content-disposition")).toContain("task-report.csv");
    const [header, row] = (await csv.text()).split("\r\n");
    expect(header).toBe('"targetLocale","new","total","finished","weighted","costUsd","pricing"');
    expect(row).toBe('"fr-FR","10","10","4","10","5.00","rate"');

    // Pricing is money: a localization manager reads it, only an admin sets it, others see none.
    const viewAs = async (role: "localization_manager" | "translator") => {
      const other = reporting.createWorkosIdentityForOrganization(identity.organization, role);
      const { user: person } = await reporting.createLocalWorkosIdentity(other);
      await ensureDefaultWorkspaceTeamMembership({
        organizationId: organization.id,
        userId: person.id,
      });
      const answer = await app.request(reportsUrl(slug, `/tasks/${job.id}/report`), {
        headers: await reporting.authHeadersFor(other),
      });
      return (await answer.json()).taskReport;
    };
    await expect(viewAs("localization_manager")).resolves.toMatchObject({
      pricing: [{ step: "translation" }, { step: "review" }],
      canSetPricing: false,
    });
    await expect(viewAs("translator")).resolves.toMatchObject({
      // Words and match bands are part of Reports, which other roles do not see.
      words: null,
      estimate: null,
      stillToCome: null,
      pricing: null,
      canSetPricing: false,
      // Other people's time is listed only for the roles that see money.
      time: { entries: [] },
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

  it("prices a task's step by a card until work on it starts, and refuses unknown rate cards", async () => {
    const workspace = await reporting.createWorkspace();
    const { identity, organization, user, project, createJob } = workspace;
    const headers = {
      ...(await reporting.authHeadersFor(identity)),
      "Content-Type": "application/json",
    };
    const slug = identity.organization.slug ?? "missing-slug";
    // A task people work on from the start is never queued.
    const job = await createJob({ status: "waiting_for_review" });
    const saved = await saveRateCard({
      organizationId: organization.id,
      actorId: user.id,
      name: "Standard",
      defaultBasis: "word",
      lines: [
        {
          sourceLocale: "en-US",
          targetLocale: "fr-FR",
          step: "translation",
          basis: "word",
          rate: "0.12",
          percentages: {},
        },
      ],
      create: true,
    });
    if (!isOk(saved)) throw new Error("expected the card to save");
    const price = (jobId: string, step: string, body: Record<string, unknown>) =>
      app.request(reportsUrl(slug, "/task-rates"), {
        method: "PUT",
        headers,
        body: JSON.stringify({ jobId, step, ...body }),
      });
    const missingCard = await price(job.id, "translation", { rateCardName: "Nope" });
    expect(missingCard.status).toBe(400);
    await expect(missingCard.json()).resolves.toMatchObject({ error: "rate_card_not_found" });
    const priced = await price(job.id, "translation", {
      rateCardName: "Standard",
      estimatedMinutes: 90,
    });
    expect(priced.status).toBe(200);
    await expect(priced.json()).resolves.toMatchObject({
      taskRate: { rateCardName: "Standard", estimatedMinutes: 90, pricedAt: expect.any(String) },
    });

    // Once time is logged on the step its pricing is fixed; the other step's is not.
    await db.insert(schema.reportingTimeEntries).values({
      organizationId: organization.id,
      projectId: project.id,
      jobId: job.id,
      contributorId: user.id,
      step: "translation",
      targetLocale: "fr-FR",
      workDate: new Date("2026-06-01T00:00:00Z"),
      minutes: 30,
    });
    const locked = await price(job.id, "translation", { rateCardName: null });
    expect(locked.status).toBe(400);
    await expect(locked.json()).resolves.toMatchObject({ error: "task_rate_locked" });
    // Time logged by mistake and deleted, or a voided cost, is not work.
    await db.insert(schema.reportingCosts).values({
      organizationId: organization.id,
      projectId: project.id,
      jobId: job.id,
      operationKey: `test:${randomUUID()}`,
      kind: "human",
      step: "review",
      amountUsd: "10",
      basis: "manual",
      voided: true,
    });
    await db.insert(schema.reportingTimeEntries).values({
      organizationId: organization.id,
      projectId: project.id,
      jobId: job.id,
      contributorId: user.id,
      step: "review",
      targetLocale: "fr-FR",
      workDate: new Date("2026-06-01T00:00:00Z"),
      minutes: 15,
      voided: true,
    });
    expect((await price(job.id, "review", { overrideUsd: "250" })).status).toBe(200);
    // A task that ended does no more work, so nothing about it can change.
    const ended = await createJob({ status: "succeeded" });
    expect((await price(ended.id, "translation", { rateCardName: "Standard" })).status).toBe(400);

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

  it("shows a viewer only the projects their teams can open, and other roles only their own time", async () => {
    const workspace = await reporting.createWorkspace();
    const { identity, organization, user, project, createProject, createJob, addSummary } =
      workspace;
    const [secretTeam] = await db
      .insert(schema.teams)
      .values({ organizationId: organization.id, slug: "secret", name: "Secret" })
      .returning();
    const secret = await createProject("Secret", secretTeam!.id);
    // A localization manager sees Reports, but only for the projects their teams can open.
    const managerIdentity = reporting.createWorkosIdentityForOrganization(
      identity.organization,
      "localization_manager",
    );
    const { user: manager } = await reporting.createLocalWorkosIdentity(managerIdentity);
    await ensureDefaultWorkspaceTeamMembership({
      organizationId: organization.id,
      userId: manager.id,
    });
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
    await startReportingForTest(organization.id);
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
    const viewer = await reporting.authHeadersFor(managerIdentity);
    const other = await reporting.authHeadersFor(translatorIdentity);

    const adminWords = await read(admin, "/words");
    expect(adminWords.wordCounts.total).toBe(109);
    // A localization manager is not limited to a team: every project, like an admin.
    const viewerWords = await read(viewer, "/words");
    expect(
      viewerWords.wordCounts.rows.map((row: { projectName: string }) => row.projectName),
    ).toEqual(["Docs", "Secret"]);
    // A translator is: the Secret project is not offered, and its time cannot be read.
    const settings = await read(other, "/settings");
    expect(settings.settings.projects.map((row: { name: string }) => row.name)).toEqual(["Docs"]);
    expect((await read(other, `/time?projectId=${secret.id}`)).time.logged.rows).toEqual([]);

    // AI and workflows outside any project are workspace-wide, shown to every billing role.
    expect((await read(admin, "/ai-usage")).aiUsage.totals.calls).toBe(1);
    expect((await read(viewer, "/ai-usage")).aiUsage.totals.calls).toBe(1);
    expect((await read(admin, "/step-times")).stepTimes.automated.workflowSteps).toHaveLength(1);
    expect((await read(viewer, "/step-times")).stepTimes.automated.workflowSteps).toHaveLength(1);

    // A translator sees no words and only their own time, on the task and on the Time tab.
    const report = await read(other, `/tasks/${job.id}/report`);
    expect(report.taskReport).toMatchObject({
      words: null,
      estimate: null,
      stillToCome: null,
      // Someone else's 30 minutes: not listed, and not counted either.
      time: { minutes: 0, people: 0, entries: [] },
      canLogTime: true,
    });
    const ownTime = await read(other, "/time");
    expect(ownTime.time).toMatchObject({
      logged: { rows: [], totals: { minutes: 0, people: 0, tasks: 0 } },
      automated: null,
    });
    const managerTime = await read(viewer, "/time");
    expect(managerTime.time.logged.totals.minutes).toBe(30);
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

  it("lets a contributor edit or void their own time, and only billing write others'", async () => {
    const workspace = await reporting.createWorkspace();
    const { identity, organization, user, project, createJob } = workspace;
    const slug = identity.organization.slug ?? "missing-slug";
    const job = await createJob();
    const translatorIdentity = reporting.createWorkosIdentityForOrganization(
      identity.organization,
      "translator",
    );
    const { user: translator } = await reporting.createLocalWorkosIdentity(translatorIdentity);
    await ensureDefaultWorkspaceTeamMembership({
      organizationId: organization.id,
      userId: translator.id,
    });
    await db.insert(schema.reportingBudgets).values({
      organizationId: organization.id,
      projectId: project.id,
      budget: "1000",
      rateCardName: "Hourly",
    });
    const card = await saveRateCard({
      organizationId: organization.id,
      actorId: user.id,
      name: "Hourly",
      defaultBasis: "hour",
      lines: [
        {
          sourceLocale: "en-US",
          targetLocale: "fr-FR",
          step: "translation",
          basis: "hour",
          rate: "60",
          percentages: {},
        },
      ],
      create: true,
    });
    if (!isOk(card)) throw new Error("expected the card to save");

    const adminHeaders = {
      ...(await reporting.authHeadersFor(identity)),
      "Content-Type": "application/json",
    };
    const translatorHeaders = {
      ...(await reporting.authHeadersFor(translatorIdentity)),
      "Content-Type": "application/json",
    };
    const created = await app.request(reportsUrl(slug, "/time-entries"), {
      method: "POST",
      headers: translatorHeaders,
      body: JSON.stringify({
        jobId: job.id,
        step: "translation",
        targetLocale: "fr-FR",
        workDate: "2026-06-01",
        minutes: 30,
      }),
    });
    expect(created.status).toBe(201);
    const { timeEntry } = (await created.json()) as { timeEntry: { id: string } };

    const ownPatch = await app.request(reportsUrl(slug, `/time-entries/${timeEntry.id}`), {
      method: "PATCH",
      headers: translatorHeaders,
      body: JSON.stringify({ minutes: 45, workDate: "2026-06-02" }),
    });
    expect(ownPatch.status).toBe(200);

    const [cost] = await db
      .select({
        amountUsd: schema.reportingCosts.amountUsd,
        voided: schema.reportingCosts.voided,
      })
      .from(schema.reportingCosts)
      .where(eq(schema.reportingCosts.timeEntryId, timeEntry.id));
    expect(cost).toMatchObject({ amountUsd: "45.00000000", voided: false });

    const [adminEntry] = await db
      .insert(schema.reportingTimeEntries)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        jobId: job.id,
        contributorId: user.id,
        step: "translation",
        targetLocale: "fr-FR",
        workDate: new Date("2026-06-03T00:00:00Z"),
        minutes: 15,
      })
      .returning();
    const foreignPatch = await app.request(reportsUrl(slug, `/time-entries/${adminEntry!.id}`), {
      method: "PATCH",
      headers: translatorHeaders,
      body: JSON.stringify({ minutes: 20, workDate: "2026-06-03" }),
    });
    expect(foreignPatch.status).toBe(403);
    await expect(foreignPatch.json()).resolves.toMatchObject({ error: "time_entry_forbidden" });

    const foreignDelete = await app.request(reportsUrl(slug, `/time-entries/${adminEntry!.id}`), {
      method: "DELETE",
      headers: translatorHeaders,
    });
    expect(foreignDelete.status).toBe(403);

    const adminPatch = await app.request(reportsUrl(slug, `/time-entries/${timeEntry.id}`), {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ minutes: 15, workDate: "2026-06-02" }),
    });
    expect(adminPatch.status).toBe(200);

    const voided = await app.request(reportsUrl(slug, `/time-entries/${timeEntry.id}`), {
      method: "DELETE",
      headers: translatorHeaders,
    });
    expect(voided.status).toBe(204);
    const [voidedCost] = await db
      .select({ voided: schema.reportingCosts.voided })
      .from(schema.reportingCosts)
      .where(eq(schema.reportingCosts.timeEntryId, timeEntry.id));
    expect(voidedCost?.voided).toBe(true);
    const missing = await app.request(reportsUrl(slug, `/time-entries/${randomUUID()}`), {
      method: "DELETE",
      headers: adminHeaders,
    });
    expect(missing.status).toBe(404);
  });

  it("lets only billing write add an expense, and only on an accessible project", async () => {
    const workspace = await reporting.createWorkspace();
    const { identity, organization, project, createJob, createProject } = workspace;
    const slug = identity.organization.slug ?? "missing-slug";
    const job = await createJob();
    const other = await createProject("Help centre");
    const otherJob = await createJob({ projectId: other.id });
    const managerIdentity = reporting.createWorkosIdentityForOrganization(
      identity.organization,
      "localization_manager",
    );
    const { user: manager } = await reporting.createLocalWorkosIdentity(managerIdentity);
    await ensureDefaultWorkspaceTeamMembership({
      organizationId: organization.id,
      userId: manager.id,
    });
    const adminHeaders = {
      ...(await reporting.authHeadersFor(identity)),
      "Content-Type": "application/json",
    };
    const managerHeaders = {
      ...(await reporting.authHeadersFor(managerIdentity)),
      "Content-Type": "application/json",
    };
    const expense = {
      projectId: project.id,
      jobId: job.id,
      step: "translation",
      amountUsd: "12.5",
      note: "Vendor invoice",
      operationKey: randomUUID(),
    };

    const forbidden = await app.request(reportsUrl(slug, "/expenses"), {
      method: "POST",
      headers: managerHeaders,
      body: JSON.stringify(expense),
    });
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({ error: "report_costs_forbidden" });

    const created = await app.request(reportsUrl(slug, "/expenses"), {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(expense),
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      expense: { amountUsd: "12.50000000", kind: "expense", jobId: job.id },
    });

    const unknownProject = await app.request(reportsUrl(slug, "/expenses"), {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        ...expense,
        projectId: `project_${randomUUID()}`,
        operationKey: randomUUID(),
      }),
    });
    expect(unknownProject.status).toBe(404);
    await expect(unknownProject.json()).resolves.toMatchObject({ error: "project_not_found" });

    const mismatchedJob = await app.request(reportsUrl(slug, "/expenses"), {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        ...expense,
        jobId: otherJob.id,
        operationKey: randomUUID(),
      }),
    });
    expect(mismatchedJob.status).toBe(404);
    await expect(mismatchedJob.json()).resolves.toMatchObject({ error: "job_not_found" });
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
