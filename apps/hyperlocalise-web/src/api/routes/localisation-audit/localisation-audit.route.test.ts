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

import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import type { LocalisationAuditService } from "@/lib/localisation-audit/service";
import type {
  LocalisationAuditError,
  PublicAuditReport,
  SafeAudit,
} from "@/lib/localisation-audit/types";
import { err, ok } from "@/lib/primitives/result/results";

const AUDIT_ID = "11111111-1111-4111-8111-111111111111";

function publicReport(): PublicAuditReport {
  return {
    reportVersion: "1",
    scoreVersion: "2026-07-24.1",
    domain: "example.com",
    auditedAt: "2026-07-24T12:00:00.000Z",
    status: "completed",
    overallStatus: "insufficient_evidence",
    overallScore: null,
    categoryScores: {
      technical: {
        status: "scored",
        score: 100,
        earnedPoints: 20,
        applicablePoints: 20,
        evaluatedRuleCount: 2,
      },
      linguistic: {
        status: "insufficient_evidence",
        score: null,
        earnedPoints: 0,
        applicablePoints: 0,
        evaluatedRuleCount: 0,
      },
      market: {
        status: "insufficient_evidence",
        score: null,
        earnedPoints: 0,
        applicablePoints: 0,
        evaluatedRuleCount: 0,
      },
    },
    findings: [],
    lockedFindingCount: 0,
    limitations: [],
  };
}

function createMockService() {
  const prepareAudit = vi.fn(async () =>
    ok<SafeAudit, LocalisationAuditError>({
      id: AUDIT_ID,
      status: "awaiting_confirmation",
      detectedLocale: "en-US",
      alternatives: [],
    }),
  );
  const service: LocalisationAuditService = {
    prepareAudit,
    getAudit: vi.fn(async () =>
      ok<SafeAudit, LocalisationAuditError>({
        id: AUDIT_ID,
        status: "awaiting_confirmation",
        detectedLocale: "en-US",
        alternatives: [],
      }),
    ),
    confirmAudit: vi.fn(async () =>
      ok<SafeAudit, LocalisationAuditError>({
        id: AUDIT_ID,
        status: "completed",
        detectedLocale: "en-US",
        alternatives: [],
        publicSlug: "opaque-public-slug-1234",
        summary: publicReport(),
      }),
    ),
    unlockAudit: vi.fn(async () =>
      ok<{ accessUrl: string }, LocalisationAuditError>({
        accessUrl: "https://app.example.test/localisation-audit/report?access=signed-token",
      }),
    ),
    getPublicReport: vi.fn(async () =>
      ok<PublicAuditReport, LocalisationAuditError>(publicReport()),
    ),
  };
  return { prepareAudit, service };
}

describe("localisation audit routes", () => {
  const { prepareAudit, service } = createMockService();
  const client = testClient(createApp({ localisationAuditService: service }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prepares an audit through the real API app and forwards the client IP", async () => {
    const response = await client.api["localisation-audit"].audits.$post(
      { json: { url: "https://example.com/en" } },
      { headers: { "cf-connecting-ip": "203.0.113.42" } },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      audit: {
        id: AUDIT_ID,
        status: "awaiting_confirmation",
        detectedLocale: "en-US",
        alternatives: [],
      },
    });
    expect(prepareAudit).toHaveBeenCalledWith({
      url: "https://example.com/en",
      ipAddress: "203.0.113.42",
    });
  });

  it("rejects malformed payloads before invoking the service", async () => {
    const response = await client.api["localisation-audit"].audits.$post({
      json: { url: "" },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_audit_payload",
    });
    expect(prepareAudit).not.toHaveBeenCalled();
  });

  it("maps stable rate-limit errors to a standard JSON error envelope", async () => {
    prepareAudit.mockResolvedValueOnce(
      err<SafeAudit, LocalisationAuditError>({
        code: "audit_rate_limited",
        message: "Try again later.",
      }),
    );

    const response = await client.api["localisation-audit"].audits.$post({
      json: { url: "https://example.com" },
    });

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "audit_rate_limited",
      message: "Try again later.",
    });
  });

  it("returns only an access URL when a report is unlocked", async () => {
    const response = await client.api["localisation-audit"].audits[":auditId"].unlock.$post({
      param: { auditId: AUDIT_ID },
      json: { email: "lead@example.com", name: "Lead" },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      report: {
        accessUrl: "https://app.example.test/localisation-audit/report?access=signed-token",
      },
    });
    expect(JSON.stringify(body)).not.toContain("lead@example.com");
  });

  it("serves only the public report projection by slug", async () => {
    const response = await client.api["localisation-audit"].reports[":slug"].$get({
      param: { slug: "opaque-public-slug-1234" },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ report: publicReport() });
    if (!("report" in body)) {
      throw new Error("Expected a public report response.");
    }
    expect(body.report).not.toHaveProperty("pages");
  });
});
