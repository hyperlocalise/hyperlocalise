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
import { describe, expect, it, vi } from "vite-plus/test";

import { FIGMA_OAUTH_MESSAGE_TYPE, postFigmaOAuthResult } from "./origins";

describe("figma oauth postMessage origins", () => {
  it("posts the auth result only to Figma plugin origins", () => {
    const postMessage = vi.fn();
    const payload = {
      type: FIGMA_OAUTH_MESSAGE_TYPE,
      code: "oauth-code",
      state: "oauth-state",
      error: null,
      errorDescription: null,
    } as const;

    postFigmaOAuthResult({ postMessage }, payload);

    expect(postMessage.mock.calls).toEqual([
      [payload, "https://www.figma.com"],
      [payload, "https://figma.com"],
      [payload, "null"],
    ]);
    expect(postMessage.mock.calls.some(([, origin]) => origin === "*")).toBe(false);
  });
});
