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

import { isFatalPrepareError } from "./prepare-audit-work";

describe("isFatalPrepareError", () => {
  it("treats private-network and invalid HTML failures as fatal", () => {
    expect(isFatalPrepareError("audit_url_not_public")).toBe(true);
    expect(isFatalPrepareError("audit_response_not_html")).toBe(true);
    expect(isFatalPrepareError("audit_response_too_large")).toBe(true);
    expect(isFatalPrepareError("invalid_audit_url")).toBe(true);
  });

  it("keeps generic fetch failures retryable", () => {
    expect(isFatalPrepareError("audit_fetch_failed")).toBe(false);
  });
});
