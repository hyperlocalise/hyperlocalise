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
  buildWorkspaceAutomationWebChatHref,
  buildWorkspaceAutomationWebChatPath,
  buildWorkspaceAutomationWebChatUrl,
} from "./workspace-automation-web-chat";

describe("workspace automation web chat URLs", () => {
  it("builds a public chat path from the organization and automation ids", () => {
    expect(
      buildWorkspaceAutomationWebChatPath({
        organizationSlug: "acme",
        automationId: "auto-1",
      }),
    ).toBe("/chat/acme/auto-1");
  });

  it("prefixes the chat path with the active locale", () => {
    expect(
      buildWorkspaceAutomationWebChatHref({
        organizationSlug: "acme",
        automationId: "auto-1",
        locale: "en",
      }),
    ).toBe("/en/chat/acme/auto-1");
  });

  it("builds an absolute chat URL for copying", () => {
    expect(
      buildWorkspaceAutomationWebChatUrl({
        organizationSlug: "acme",
        automationId: "auto-1",
        locale: "ja",
        origin: "https://app.hyperlocalise.test",
      }),
    ).toBe("https://app.hyperlocalise.test/ja/chat/acme/auto-1");
  });
});
