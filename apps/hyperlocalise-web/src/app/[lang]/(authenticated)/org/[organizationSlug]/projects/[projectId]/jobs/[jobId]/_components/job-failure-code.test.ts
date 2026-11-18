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

import { jobFailureCodeMessage } from "./job-failure-code";
import { jobFailureCodeMessages } from "./job-failure-code.messages";

describe("jobFailureCodeMessage", () => {
  it("maps workflow failure codes to plain-language reasons", () => {
    expect(jobFailureCodeMessage("sandbox_timeout")).toBe(jobFailureCodeMessages.timedOut);
    expect(jobFailureCodeMessage("ai_credit_exhausted")).toBe(
      jobFailureCodeMessages.creditsExhausted,
    );
    expect(jobFailureCodeMessage("parse_failed")).toBe(jobFailureCodeMessages.sourceFileInvalid);
  });

  it("returns null for unknown or missing codes so the recorded message is used", () => {
    expect(jobFailureCodeMessage("something_new")).toBeNull();
    expect(jobFailureCodeMessage(null)).toBeNull();
  });
});
