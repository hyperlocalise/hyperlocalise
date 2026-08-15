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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { LocalisationAuditDailyQuotaExceededError } from "@/lib/localisation-audit/daily-quota";
import { ok } from "@/lib/primitives/result/results";

const {
  checkBotIdMock,
  resolveDomainIdentityMock,
  assertResolvablePublicHttpUrlMock,
  claimOrReuseMock,
  attachWorkflowMock,
  failAuditMock,
  findBySlugMock,
  upsertLeadMock,
  markLeadQueuedMock,
  markLeadFailedMock,
  verifyTokenMock,
  trackMock,
} = vi.hoisted(() => ({
  checkBotIdMock: vi.fn(),
  resolveDomainIdentityMock: vi.fn(),
  assertResolvablePublicHttpUrlMock: vi.fn(),
  claimOrReuseMock: vi.fn(),
  attachWorkflowMock: vi.fn(),
  failAuditMock: vi.fn(),
  findBySlugMock: vi.fn(),
  upsertLeadMock: vi.fn(),
  markLeadQueuedMock: vi.fn(),
  markLeadFailedMock: vi.fn(),
  verifyTokenMock: vi.fn(),
  trackMock: vi.fn(),
}));

vi.mock("botid/server", () => ({
  checkBotId: checkBotIdMock,
}));

vi.mock("@/lib/analytics/server", () => ({
  serverAnalytics: {
    track: trackMock,
  },
}));

vi.mock("@/lib/localisation-audit/domain-slug", async () => {
  const actual = await vi.importActual<typeof import("@/lib/localisation-audit/domain-slug")>(
    "@/lib/localisation-audit/domain-slug",
  );
  return {
    ...actual,
    resolveDomainIdentity: resolveDomainIdentityMock,
  };
});

vi.mock("@/lib/security/public-http-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/public-http-fetch")>();
  return {
    ...actual,
    assertResolvablePublicHttpUrl: assertResolvablePublicHttpUrlMock,
  };
});

vi.mock("@/lib/localisation-audit/store", () => ({
  claimOrReuseLocalisationAudit: claimOrReuseMock,
  attachLocalisationAuditWorkflowRun: attachWorkflowMock,
  failLocalisationAudit: failAuditMock,
  findLocalisationAuditBySlug: findBySlugMock,
  isLocalisationAuditRetryable: (audit: { status: string }) => audit.status === "failed",
  isLocalisationAuditRerunnable: () => false,
  localisationAuditRerunAvailableAt: () => null,
  upsertLocalisationAuditLeadForDelivery: upsertLeadMock,
  markLocalisationAuditLeadEmailQueued: markLeadQueuedMock,
  markLocalisationAuditLeadEmailFailed: markLeadFailedMock,
  verifyLocalisationAuditReportToken: verifyTokenMock,
}));

function succeededAudit(overrides: Record<string, unknown> = {}) {
  return {
    id: "audit-1",
    domainKey: "example.com",
    domainSlug: "example-com",
    sourceUrl: "https://example.com/",
    status: "succeeded",
    attemptNumber: 1,
    progressStage: "completed",
    score: 82,
    focusLocales: [],
    teaser: { score: 82, headlineFindings: [], findingsCount: 0 },
    report: { score: 82, findings: [] },
    errorCode: null,
    errorMessage: null,
    createdAt: new Date("2026-07-25T00:00:00.000Z"),
    completedAt: new Date("2026-07-25T00:01:00.000Z"),
    statusUpdatedAt: new Date("2026-07-25T00:01:00.000Z"),
    ...overrides,
  };
}

describe("localisation audit routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkBotIdMock.mockResolvedValue({
      isBot: false,
      isHuman: true,
      isVerifiedBot: false,
      bypassed: true,
    });
    resolveDomainIdentityMock.mockReturnValue(
      ok({
        sourceUrl: "https://example.com/",
        hostname: "example.com",
        domainKey: "example.com",
        domainSlug: "example-com",
        origin: "https://example.com",
      }),
    );
    assertResolvablePublicHttpUrlMock.mockResolvedValue(ok(new URL("https://example.com/")));
  });

  it("rejects bots before domain work", async () => {
    checkBotIdMock.mockResolvedValue({
      isBot: true,
      isHuman: false,
      isVerifiedBot: false,
      bypassed: false,
    });

    const app = createApp({
      localisationAuditQueue: {
        enqueue: vi.fn(async () => ({ ids: ["run-1"] })),
      },
    });

    const response = await app.request("/api/localisation-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });

    expect(response.status).toBe(403);
    expect(claimOrReuseMock).not.toHaveBeenCalled();
    expect(resolveDomainIdentityMock).not.toHaveBeenCalled();
  });

  it("allows human/local-development traffic", async () => {
    claimOrReuseMock.mockResolvedValue({
      audit: succeededAudit(),
      outcome: "reused_success",
    });

    const app = createApp({
      localisationAuditQueue: {
        enqueue: vi.fn(async () => ({ ids: ["run-1"] })),
      },
    });

    const response = await app.request("/api/localisation-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reused).toBe(true);
    expect(body.outcome).toBe("reused_success");
  });

  it("reclaims and enqueues a new attempt for failed audits", async () => {
    const enqueue = vi.fn(async () => ({ ids: ["run-2"] }));
    claimOrReuseMock.mockResolvedValue({
      audit: succeededAudit({
        status: "queued",
        attemptNumber: 2,
        progressStage: "queued",
        report: null,
        teaser: null,
        score: null,
        completedAt: null,
      }),
      outcome: "reclaimed",
    });
    findBySlugMock.mockResolvedValue(
      succeededAudit({
        status: "queued",
        attemptNumber: 2,
        progressStage: "queued",
        report: null,
        teaser: null,
        score: null,
        completedAt: null,
      }),
    );

    const app = createApp({
      localisationAuditQueue: { enqueue },
    });

    const response = await app.request("/api/localisation-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });

    expect(response.status).toBe(200);
    expect(enqueue).toHaveBeenCalledWith({ auditId: "audit-1", attemptNumber: 2 });
    expect(attachWorkflowMock).toHaveBeenCalled();
  });

  it("rejects new runs when the daily quota is exhausted", async () => {
    claimOrReuseMock.mockRejectedValue(new LocalisationAuditDailyQuotaExceededError(10));

    const app = createApp({
      localisationAuditQueue: {
        enqueue: vi.fn(async () => ({ ids: ["run-1"] })),
      },
    });

    const response = await app.request("/api/localisation-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe("localisation_audit_daily_quota");
    expect(body.message).toContain("10 audits");
  });

  it("marks enqueue failures as retryable failed audits", async () => {
    claimOrReuseMock.mockResolvedValue({
      audit: succeededAudit({
        status: "queued",
        attemptNumber: 1,
        progressStage: "queued",
        report: null,
        teaser: null,
        score: null,
      }),
      outcome: "created",
    });

    const app = createApp({
      localisationAuditQueue: {
        enqueue: vi.fn(async () => {
          throw new Error("boom");
        }),
      },
    });

    const response = await app.request("/api/localisation-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });

    expect(response.status).toBe(409);
    expect(failAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        auditId: "audit-1",
        attemptNumber: 1,
        errorCode: "localisation_audit_enqueue_failed",
      }),
    );
  });

  it("returns the full report publicly for succeeded audits", async () => {
    findBySlugMock.mockResolvedValue(succeededAudit());
    const { createLocalisationAuditRoutes } = await import("./localisation-audit.route");
    const routes = createLocalisationAuditRoutes();

    const response = await routes.request("/example-com");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.audit.unlocked).toBe(true);
    expect(body.audit.report).toEqual(expect.objectContaining({ score: 82 }));
  });

  it("queues report email instead of unlocking immediately", async () => {
    findBySlugMock.mockResolvedValue(succeededAudit());
    upsertLeadMock.mockResolvedValue({
      lead: { id: "lead-1" },
      token: "opaque-token",
      created: true,
      resendAllowed: true,
      cooldownMsRemaining: 0,
    });
    const emailEnqueue = vi.fn(async () => ({ ids: ["email-1"] }));

    const app = createApp({
      localisationAuditQueue: { enqueue: vi.fn(async () => ({ ids: ["run-1"] })) },
    });
    // Inject email queue via route options through createApp — extend createApp if needed.
    // For now call the route module factory directly when createApp lacks the option.
    const { createLocalisationAuditRoutes } = await import("./localisation-audit.route");
    const routes = createLocalisationAuditRoutes({
      localisationAuditReportEmailQueue: { enqueue: emailEnqueue },
    });
    const response = await routes.request("/example-com/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "lead@example.com", locale: "en" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.audit.unlocked).toBe(true);
    expect(body.audit.report).toEqual(expect.objectContaining({ score: 82 }));
    expect(body.delivery.status).toBe("queued");
    expect(emailEnqueue).toHaveBeenCalledWith({
      leadId: "lead-1",
      token: "opaque-token",
    });
    expect(app).toBeTruthy();
  });

  it("stores pending lead while audit is still running", async () => {
    findBySlugMock.mockResolvedValue(
      succeededAudit({
        status: "running",
        progressStage: "crawling",
        report: null,
        teaser: null,
        score: null,
        completedAt: null,
      }),
    );
    upsertLeadMock.mockResolvedValue({
      lead: { id: "lead-2" },
      token: "token-2",
      created: true,
      resendAllowed: true,
      cooldownMsRemaining: 0,
    });
    const emailEnqueue = vi.fn(async () => ({ ids: ["email-1"] }));
    const { createLocalisationAuditRoutes } = await import("./localisation-audit.route");
    const routes = createLocalisationAuditRoutes({
      localisationAuditReportEmailQueue: { enqueue: emailEnqueue },
    });

    const response = await routes.request("/example-com/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "lead@example.com", locale: "en" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.delivery.status).toBe("pending");
    expect(emailEnqueue).not.toHaveBeenCalled();
  });

  it("rejects bot unlock requests", async () => {
    checkBotIdMock.mockResolvedValue({
      isBot: true,
      isHuman: false,
      isVerifiedBot: false,
      bypassed: false,
    });
    const { createLocalisationAuditRoutes } = await import("./localisation-audit.route");
    const routes = createLocalisationAuditRoutes({
      localisationAuditReportEmailQueue: { enqueue: vi.fn(async () => ({ ids: [] })) },
    });

    const response = await routes.request("/example-com/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "lead@example.com" }),
    });

    expect(response.status).toBe(403);
    expect(upsertLeadMock).not.toHaveBeenCalled();
  });

  it("verifies token, sets per-domain cookie, and redirects", async () => {
    verifyTokenMock.mockResolvedValue({
      lead: { id: "lead-1", email: "lead@example.com" },
      audit: succeededAudit(),
    });
    const { createLocalisationAuditRoutes } = await import("./localisation-audit.route");
    const routes = createLocalisationAuditRoutes();

    const response = await routes.request("/example-com/verify?token=abc&locale=en", {
      method: "GET",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/en/localisation-audit/example-com");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("hl_la_unlock_example-com=");
  });

  it("normalizes unsupported verify locales instead of open-redirecting", async () => {
    verifyTokenMock.mockResolvedValue({
      lead: { id: "lead-1", email: "lead@example.com" },
      audit: succeededAudit(),
    });
    const { createLocalisationAuditRoutes } = await import("./localisation-audit.route");
    const routes = createLocalisationAuditRoutes();

    const response = await routes.request("/example-com/verify?token=abc&locale=%2F%2Fevil.co", {
      method: "GET",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/en/localisation-audit/example-com");
  });

  it("rejects expired verify tokens", async () => {
    verifyTokenMock.mockResolvedValue(null);
    const { createLocalisationAuditRoutes } = await import("./localisation-audit.route");
    const routes = createLocalisationAuditRoutes();

    const response = await routes.request("/example-com/verify?token=used", {
      method: "GET",
    });

    expect(response.status).toBe(403);
  });
});
