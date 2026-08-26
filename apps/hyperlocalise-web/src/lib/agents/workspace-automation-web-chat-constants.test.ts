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
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import {
  buildWebChatSourceThreadId,
  isWebChatImageContentType,
  WEB_CHAT_IMAGE_UPLOAD_MULTIPART_OVERHEAD_BYTES,
  WEB_CHAT_MAX_IMAGE_BYTES,
  WEB_CHAT_MAX_IMAGE_FILES,
  WEB_CHAT_MAX_IMAGE_REQUEST_BYTES,
} from "./workspace-automation-web-chat-constants";

describe("workspace automation web chat constants", () => {
  it("accepts allowed image content types case-insensitively", () => {
    expect(isWebChatImageContentType("image/png")).toBe(true);
    expect(isWebChatImageContentType("IMAGE/JPEG")).toBe(true);
    expect(isWebChatImageContentType("application/pdf")).toBe(false);
  });

  it("builds a stable visitor thread id", () => {
    expect(
      buildWebChatSourceThreadId({
        automationId: "auto-1",
        visitorId: "visitor-1",
      }),
    ).toBe("web-chat:auto-1:visitor-1");
  });

  it("sizes the request body limit for every attached image plus multipart overhead", () => {
    expect(WEB_CHAT_MAX_IMAGE_REQUEST_BYTES).toBe(
      WEB_CHAT_MAX_IMAGE_FILES * WEB_CHAT_MAX_IMAGE_BYTES +
        WEB_CHAT_IMAGE_UPLOAD_MULTIPART_OVERHEAD_BYTES,
    );
  });

  it("does not import the drizzle web chat store from the public chat client page", () => {
    const pageSource = readFileSync(
      new URL(
        "../../app/[lang]/(public-chat)/chat/[organizationSlug]/[automationId]/web-chat-page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    expect(pageSource).not.toMatch(/from ["']@\/lib\/agents\/workspace-automation-web-chat["']/);
    expect(pageSource).toMatch(
      /from ["']@\/lib\/agents\/workspace-automation-web-chat-constants["']/,
    );
  });
});
