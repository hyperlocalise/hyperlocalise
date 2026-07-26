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

vi.mock("workflow", () => ({
  getWorkflowMetadata: vi.fn(() => ({ workflowRunId: "run_123" })),
}));

const { prepareMock, queueEmailsMock } = vi.hoisted(() => ({
  prepareMock: vi.fn(),
  queueEmailsMock: vi.fn(),
}));

vi.mock("./steps/localisation-audit", () => ({
  analyzeLocalisationAuditStep: vi.fn(),
  crawlLocalisationAuditStep: vi.fn(),
  failLocalisationAuditStep: vi.fn(),
  prepareLocalisationAuditStep: prepareMock,
  queuePendingLocalisationAuditReportEmailsStep: queueEmailsMock,
  setLocalisationAuditProgressStep: vi.fn(),
}));

import { localisationAuditWorkflow } from "./localisation-audit";

describe("localisationAuditWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queues pending report emails when an audit already completed", async () => {
    prepareMock.mockResolvedValue({
      ok: true,
      alreadyCompleted: true,
      staleAttempt: false,
      auditId: "audit_123",
      attemptNumber: 1,
    });
    queueEmailsMock.mockResolvedValue({ queued: 1 });

    const result = await localisationAuditWorkflow({
      auditId: "audit_123",
      attemptNumber: 1,
    });

    expect(queueEmailsMock).toHaveBeenCalledWith("audit_123");
    expect(result).toEqual({
      ok: true,
      alreadyCompleted: true,
      auditId: "audit_123",
      workflowRunId: "run_123",
    });
  });
});
