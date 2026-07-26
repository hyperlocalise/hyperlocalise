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

const { findAuditMock, findLeadMock, markFailedMock, markSentMock, sendMock, trackMock } =
  vi.hoisted(() => ({
    findAuditMock: vi.fn(),
    findLeadMock: vi.fn(),
    markFailedMock: vi.fn(),
    markSentMock: vi.fn(),
    sendMock: vi.fn(),
    trackMock: vi.fn(),
  }));

vi.mock("react-email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-email")>()),
  render: vi.fn(async () => "<html></html>"),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

vi.mock("@/lib/analytics/server", () => ({
  serverAnalytics: { track: trackMock },
}));

vi.mock("@/lib/env", () => ({
  env: {
    RESEND_API_KEY: "re_test",
    RESEND_FROM_ADDRESS: "reports@example.com",
    RESEND_FROM_NAME: "Hyperlocalise",
  },
}));

vi.mock("@/lib/localisation-audit/store", () => ({
  findLocalisationAuditById: findAuditMock,
  findLocalisationAuditLeadById: findLeadMock,
  markLocalisationAuditLeadEmailFailed: markFailedMock,
  markLocalisationAuditLeadEmailSent: markSentMock,
}));

import { hashLocalisationAuditReportToken } from "@/lib/localisation-audit/email-unlock";

import { sendLocalisationAuditReportEmailStep } from "./localisation-audit-report-email";

const token = "opaque-report-token";

function lead(deliveryStatus = "queued") {
  return {
    id: "lead-1",
    auditId: "audit-1",
    email: "lead@example.com",
    locale: "en",
    deliveryStatus,
    tokenHash: hashLocalisationAuditReportToken(token),
    tokenExpiresAt: new Date(Date.now() + 60_000),
  };
}

describe("sendLocalisationAuditReportEmailStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findLeadMock.mockResolvedValue(lead());
    findAuditMock.mockResolvedValue({
      id: "audit-1",
      domainKey: "example.com",
      domainSlug: "example-com",
      status: "succeeded",
      score: 80,
      completedAt: new Date(),
      teaser: { headlineFindings: [] },
      report: { completedAt: new Date().toISOString(), findings: [] },
    });
    sendMock.mockResolvedValue({ data: { id: "email-1" }, error: null });
  });

  it("skips leads that were already sent", async () => {
    findLeadMock.mockResolvedValue(lead("sent"));

    const result = await sendLocalisationAuditReportEmailStep({ leadId: "lead-1", token });

    expect(result).toEqual({ ok: true, skipped: true, reason: "already_sent" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("skips stale queued tokens instead of replacing the current token", async () => {
    const result = await sendLocalisationAuditReportEmailStep({
      leadId: "lead-1",
      token: "stale-token",
    });

    expect(result).toEqual({ ok: true, skipped: true, reason: "stale_token" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("uses a stable provider idempotency key", async () => {
    await sendLocalisationAuditReportEmailStep({ leadId: "lead-1", token });
    await sendLocalisationAuditReportEmailStep({ leadId: "lead-1", token });

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock.mock.calls[0]?.[1]).toEqual(sendMock.mock.calls[1]?.[1]);
    expect(sendMock.mock.calls[0]?.[1]).toEqual({
      idempotencyKey: `localisation-audit-report:lead-1:${hashLocalisationAuditReportToken(token)}`,
    });
  });
});
