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

import {
  getTmsProviderActionCapability,
  providerSupportsTmsAction,
} from "@/lib/providers/capabilities/tms-capabilities";

import { getProviderCommentPusher } from "@/lib/providers/adapters/tms-provider-registry";

describe("getProviderCommentPusher", () => {
  it.each([
    ["smartling", true],
    ["crowdin", true],
    ["lokalise", true],
    ["phrase", false],
  ] as const)("returns whether %s has a comment pusher implementation", (provider, supported) => {
    const pusher = getProviderCommentPusher(provider);
    if (supported) {
      expect(pusher).toBeTypeOf("function");
    } else {
      expect(pusher).toBeNull();
    }
  });
});

describe("unsupported comment capability behavior", () => {
  it("keeps Phrase comment writing visible but disabled because no pusher exists", () => {
    expect(providerSupportsTmsAction("lokalise", "comments.write")).toBe(true);
    expect(getProviderCommentPusher("lokalise")).not.toBeNull();

    expect(providerSupportsTmsAction("phrase", "comments.write")).toBe(true);
    expect(getProviderCommentPusher("phrase")).toBeNull();
    expect(getTmsProviderActionCapability("phrase", "comments.write")).toMatchObject({
      supported: true,
      ui: {
        state: "disabled",
        disabledReason:
          "This provider connector does not support writing comments back to the TMS yet.",
      },
    });
  });
});
