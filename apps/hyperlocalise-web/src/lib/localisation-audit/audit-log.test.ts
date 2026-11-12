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

import { auditStatusCounts, describeAuditError, redactAuditErrorText } from "./audit-log";

describe("audit error redaction", () => {
  it("keeps only the scheme and host of URLs", () => {
    expect(
      redactAuditErrorText("failed https://customer.example/account?email=a%40b.com done"),
    ).toBe("failed https://customer.example/<redacted> done");
  });

  it("strips bearer tokens and collapses whitespace", () => {
    expect(redactAuditErrorText("Authorization: Bearer tl_secret\n\n  call log")).toBe(
      "Authorization: Bearer <redacted> call log",
    );
  });

  it("replaces email addresses", () => {
    expect(redactAuditErrorText("owner jane.doe+x@example.co.uk not allowed")).toBe(
      "owner <email> not allowed",
    );
  });

  it("caps long messages", () => {
    expect(redactAuditErrorText("x".repeat(600))).toHaveLength(501);
  });

  it("includes the cause code of network errors", () => {
    const error = new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });

    expect(describeAuditError(error)).toEqual({
      name: "TypeError",
      message: "fetch failed",
      causeCode: "ECONNRESET",
    });
  });
});

describe("auditStatusCounts", () => {
  it("groups statuses by class and keeps unresponsive pages apart", () => {
    expect(
      auditStatusCounts([{ status: 200 }, { status: 204 }, { status: 403 }, { status: 0 }]),
    ).toEqual({ "2xx": 2, "4xx": 1, "0": 1 });
  });
});
