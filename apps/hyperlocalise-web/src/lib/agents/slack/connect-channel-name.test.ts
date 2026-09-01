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

import {
  maskEmailForDisplay,
  slackConnectChannelName,
  slackConnectChannelPurpose,
  slackConnectOrganizationIdFromPurpose,
  slackConnectUniqueChannelName,
} from "./connect-channel-name";

const organizationId = "11111111-2222-4333-8444-555555555555";

describe("slackConnectChannelName", () => {
  it("builds a Slack-safe ext-slug-id name", () => {
    expect(slackConnectChannelName("Acme Corp", organizationId)).toBe("ext-acme-corp-11111111");
  });

  it("uses a fallback slug when the organization name is empty", () => {
    expect(slackConnectChannelName("   ", organizationId)).toBe("ext-workspace-11111111");
  });

  it("keeps the organization suffix when truncating long slugs", () => {
    const name = slackConnectChannelName("a".repeat(100), organizationId);
    expect(name.length).toBeLessThanOrEqual(80);
    expect(name.startsWith("ext-")).toBe(true);
    expect(name.endsWith("-11111111")).toBe(true);
  });

  it("does not collide when two long slugs share a prefix", () => {
    const otherOrganizationId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const left = slackConnectChannelName("a".repeat(100), organizationId);
    const right = slackConnectChannelName("a".repeat(100), otherOrganizationId);
    expect(left).not.toBe(right);
  });
});

describe("slackConnectUniqueChannelName", () => {
  it("uses the full organization id hex as the unique name", () => {
    expect(slackConnectUniqueChannelName(organizationId)).toBe(
      "ext-11111111222243338444555555555555",
    );
  });
});

describe("slackConnectChannelPurpose", () => {
  it("round-trips the organization id", () => {
    const purpose = slackConnectChannelPurpose(organizationId);
    expect(slackConnectOrganizationIdFromPurpose(purpose)).toBe(organizationId);
  });

  it("rejects purposes from other tenants", () => {
    expect(slackConnectOrganizationIdFromPurpose("hyperlocalise-org:other")).toBe("other");
    expect(slackConnectOrganizationIdFromPurpose("random purpose")).toBeNull();
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
