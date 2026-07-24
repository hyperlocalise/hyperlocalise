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

const { getWorkflowMetadataMock, prepareLocalisationAuditStepMock, FatalErrorMock } = vi.hoisted(
  () => {
    class FatalError extends Error {
      fatal = true;
    }
    return {
      getWorkflowMetadataMock: vi.fn(() => ({ workflowRunId: "run_1" })),
      prepareLocalisationAuditStepMock: vi.fn(),
      FatalErrorMock: FatalError,
    };
  },
);

vi.mock("workflow", () => ({
  getWorkflowMetadata: getWorkflowMetadataMock,
  FatalError: FatalErrorMock,
}));

vi.mock("./steps/localisation-audit", () => ({
  prepareLocalisationAuditStep: prepareLocalisationAuditStepMock,
}));

import { localisationAuditPrepareWorkflow } from "./localisation-audit-prepare";

describe("localisationAuditPrepareWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the prepared audit when the prepare step succeeds", async () => {
    prepareLocalisationAuditStepMock.mockResolvedValueOnce({
      ok: true,
      audit: {
        id: "audit-1",
        status: "awaiting_confirmation",
        detectedLocale: "en-US",
        alternatives: [],
      },
    });

    await expect(localisationAuditPrepareWorkflow({ auditId: "audit-1" })).resolves.toMatchObject({
      id: "audit-1",
      status: "awaiting_confirmation",
    });
  });

  it("throws a fatal error for non-retryable prepare failures", async () => {
    prepareLocalisationAuditStepMock.mockResolvedValueOnce({
      ok: false,
      code: "audit_url_not_public",
      message: "Private network rejected.",
      fatal: true,
    });

    await expect(localisationAuditPrepareWorkflow({ auditId: "audit-1" })).rejects.toBeInstanceOf(
      FatalErrorMock,
    );
  });
});
