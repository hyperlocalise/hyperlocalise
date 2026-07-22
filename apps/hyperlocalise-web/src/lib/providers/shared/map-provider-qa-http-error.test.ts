/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { mapProviderQaErrorToHttpStatus } from "./map-provider-qa-http-error";

describe("mapProviderQaErrorToHttpStatus", () => {
  it("maps provider configuration errors to 400", () => {
    expect(mapProviderQaErrorToHttpStatus(new Error("provider_credential_not_found"))).toBe(400);
    expect(mapProviderQaErrorToHttpStatus(new Error("invalid_crowdin_project_id"))).toBe(400);
    expect(mapProviderQaErrorToHttpStatus(new Error("crowdin_auth_invalid"))).toBe(400);
  });

  it("maps transient infrastructure errors to 503", () => {
    expect(
      mapProviderQaErrorToHttpStatus(new Error("Phrase returned HTTP 429 while listing files")),
    ).toBe(503);
    expect(mapProviderQaErrorToHttpStatus(new Error("Phrase health check timed out"))).toBe(503);
  });

  it("maps sandbox and QA execution failures to 500", () => {
    expect(mapProviderQaErrorToHttpStatus(new Error("hl check failed (exit 1): boom"))).toBe(500);
    expect(
      mapProviderQaErrorToHttpStatus(
        new Error("hl check report is not valid JSON: Unexpected token"),
      ),
    ).toBe(500);
  });
});
