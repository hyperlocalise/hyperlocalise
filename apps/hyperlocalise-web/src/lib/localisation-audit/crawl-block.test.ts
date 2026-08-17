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

import { detectLocalisationAuditCrawlBlock } from "./crawl-block";

describe("detectLocalisationAuditCrawlBlock", () => {
  it.each([
    [401, "<html><body>Unauthorized</body></html>"],
    [403, "<html><body>Forbidden</body></html>"],
    [429, "<html><body>Too many requests</body></html>"],
  ])("detects access-denied status %s", (status, html) => {
    expect(detectLocalisationAuditCrawlBlock(status, html)).toBe("bot_protection");
  });

  it("detects a bot challenge served with a successful status", () => {
    expect(
      detectLocalisationAuditCrawlBlock(
        200,
        "<html><title>Just a moment...</title><body>Checking your browser before accessing.</body></html>",
      ),
    ).toBe("bot_protection");
  });

  it("does not classify normal content or generic server errors as bot protection", () => {
    expect(
      detectLocalisationAuditCrawlBlock(
        200,
        "<html><title>Welcome</title><body>Our global product helps teams localize.</body></html>",
      ),
    ).toBeNull();
    expect(
      detectLocalisationAuditCrawlBlock(503, "<html><body>Temporarily unavailable</body></html>"),
    ).toBeNull();
  });
});
