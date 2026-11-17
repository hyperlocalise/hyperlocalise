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

  it("flags a nearly empty page that tells the visitor they are blocked", () => {
    expect(
      detectLocalisationAuditCrawlBlock(
        200,
        "<html><title>Attention</title><body>Access denied. Request blocked.</body></html>",
      ),
    ).toBe("bot_protection");
  });

  it.each([
    [
      "cloudflare opt",
      "<html><head><script>window._cf_chl_opt={}</script></head><body></body></html>",
    ],
    ["cloudflare widget", '<html><body><div id="cf-chl-widget"></div></body></html>'],
    ["cloudflare bypass", '<html><body><div id="cf-chl-bypass"></div></body></html>'],
    [
      "cloudflare challenge host",
      '<html><body><script src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script></body></html>',
    ],
    [
      "datadome",
      '<html><body><script src="https://captcha-delivery.com/captcha/"></script></body></html>',
    ],
    ["perimeterx", '<html><body><div id="px-captcha"></div></body></html>'],
    [
      "incapsula",
      '<html><body><script src="/_Incapsula_Resource?SWUDNSAI=31"></script></body></html>',
    ],
  ])("flags a nearly empty %s interstitial", (_name, html) => {
    expect(detectLocalisationAuditCrawlBlock(200, html)).toBe("bot_protection");
  });

  it.each(["Discord", "Medium", "Indeed"])(
    "does not flag a loaded %s page that includes Cloudflare's background script",
    (site) => {
      const html = `<html><head>
        <script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>
        <script>var s=document.createElement("script");s.src="/cdn-cgi/challenge-platform/scripts/jsd/main.js";</script>
        <title>${site}</title>
      </head><body><p>Open roles and stories from the ${site} homepage.</p></body></html>`;

      expect(detectLocalisationAuditCrawlBlock(200, html)).toBeNull();
    },
  );

  it("does not flag challenge copy that only appears inside a script on a real page", () => {
    expect(
      detectLocalisationAuditCrawlBlock(
        200,
        `<html><title>Welcome</title><body>
          <script>console.log("Just a moment... checking your browser");</script>
          <p>Our global product helps teams localize.</p>
        </body></html>`,
      ),
    ).toBeNull();
  });

  it("does not flag challenge copy or vendor widgets on a full page", () => {
    const article = "Teams localise product copy for each market. ".repeat(80);
    expect(
      detectLocalisationAuditCrawlBlock(
        200,
        `<html><head><script>window._cf_chl_opt={}</script><title>Guide</title></head><body><p>Access denied is a phrase in this ${article}</p></body></html>`,
      ),
    ).toBeNull();
  });
});
