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

import { maskEmailForDisplay, slackConnectChannelName } from "./connect-channel-name";

describe("slackConnectChannelName", () => {
  it("builds a Slack-safe ext-slug name", () => {
    expect(slackConnectChannelName("Acme Corp")).toBe("ext-acme-corp");
  });

  it("uses a fallback slug when the organization name is empty", () => {
    expect(slackConnectChannelName("   ")).toBe("ext-workspace");
  });

  it("truncates names that exceed Slack's 80-character limit", () => {
    const name = slackConnectChannelName("a".repeat(100));
    expect(name.length).toBeLessThanOrEqual(80);
    expect(name.startsWith("ext-")).toBe(true);
  });
});

describe("maskEmailForDisplay", () => {
  it("keeps the first local character and the domain", () => {
    expect(maskEmailForDisplay("maya@acme.com")).toBe("m***@acme.com");
  });

  it("masks invalid values", () => {
    expect(maskEmailForDisplay("not-an-email")).toBe("***");
  });
});
