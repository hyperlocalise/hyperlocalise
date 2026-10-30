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

import { buildHubspotSourcePath, isHubspotSourcePath, parseHubspotSourcePath } from "./source-path";

describe("hubspot source paths", () => {
  it("round-trips the source id and chooses json or html", () => {
    const email = buildHubspotSourcePath({ kind: "email", id: "email/1", name: "Welcome" });
    expect(email).toBe("hubspot/emails/email%2F1/welcome.json");
    expect(parseHubspotSourcePath(email)).toEqual({ kind: "email", id: "email/1" });
    expect(isHubspotSourcePath(email)).toBe(true);

    const blog = buildHubspotSourcePath({ kind: "blog", id: "post-9", name: "Launch" });
    expect(blog).toBe("hubspot/blog-posts/post-9/launch.html");
    expect(parseHubspotSourcePath(blog)).toEqual({ kind: "blog", id: "post-9" });

    const landing = buildHubspotSourcePath({ kind: "landing-page", id: "lp-1", name: "Pricing" });
    expect(landing).toBe("hubspot/landing-pages/lp-1/pricing.json");
    expect(parseHubspotSourcePath(landing)).toEqual({ kind: "landing-page", id: "lp-1" });

    const website = buildHubspotSourcePath({ kind: "website-page", id: "site-2", name: "About" });
    expect(website).toBe("hubspot/website-pages/site-2/about.json");
    expect(parseHubspotSourcePath(website)).toEqual({ kind: "website-page", id: "site-2" });

    const template = buildHubspotSourcePath({
      kind: "message-template",
      id: "tmpl-3",
      name: "Follow up",
    });
    expect(template).toBe("hubspot/message-templates/tmpl-3/follow-up.html");
    expect(parseHubspotSourcePath(template)).toEqual({ kind: "message-template", id: "tmpl-3" });
    expect(isHubspotSourcePath("projects/welcome.json")).toBe(false);
  });
});
