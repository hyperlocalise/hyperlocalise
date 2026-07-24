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
import { describe, expect, it } from "vite-plus/test";

import { mintPrivateReportAccessToken, verifyPrivateReportAccessToken } from "./access-token";

const SECRET = "test-secret-that-is-at-least-32-characters";
const NOW = new Date("2026-07-24T12:00:00.000Z");

describe("private localisation report access token", () => {
  it("verifies an unexpired signed token", () => {
    const token = mintPrivateReportAccessToken({
      auditId: "audit-id",
      reportId: "report-id",
      secret: SECRET,
      now: NOW,
      lifetimeSeconds: 60,
    });

    const result = verifyPrivateReportAccessToken({
      token,
      secret: SECRET,
      now: new Date("2026-07-24T12:00:30.000Z"),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        auditId: "audit-id",
        reportId: "report-id",
        expiresAt: new Date("2026-07-24T12:01:00.000Z"),
      });
    }
  });

  it("rejects an expired token", () => {
    const token = mintPrivateReportAccessToken({
      auditId: "audit-id",
      reportId: "report-id",
      secret: SECRET,
      now: NOW,
      lifetimeSeconds: 60,
    });

    const result = verifyPrivateReportAccessToken({
      token,
      secret: SECRET,
      now: new Date("2026-07-24T12:01:00.000Z"),
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_report_access_token" },
    });
  });

  it("rejects payload and signature tampering", () => {
    const token = mintPrivateReportAccessToken({
      auditId: "audit-id",
      reportId: "report-id",
      secret: SECRET,
      now: NOW,
    });
    const [payload, signature] = token.split(".");

    expect(
      verifyPrivateReportAccessToken({
        token: `${payload}x.${signature}`,
        secret: SECRET,
        now: NOW,
      }),
    ).toMatchObject({ ok: false });
    expect(
      verifyPrivateReportAccessToken({
        token: `${payload}.${signature}x`,
        secret: SECRET,
        now: NOW,
      }),
    ).toMatchObject({ ok: false });
  });
});
