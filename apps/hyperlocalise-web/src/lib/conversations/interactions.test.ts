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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { interactionMessagesMock } = vi.hoisted(() => ({
  interactionMessagesMock: vi.fn(),
}));

vi.mock("@/lib/database", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: interactionMessagesMock,
      })),
    })),
  },
  schema: {
    interactionMessages: {
      interactionId: "interaction_id",
      text: "text",
      attachments: "attachments",
    },
  },
}));

import { interactionHasTranslationAttachments } from "./interactions";

describe("interactionHasTranslationAttachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts attachments persisted on the current interaction message", async () => {
    interactionMessagesMock.mockResolvedValueOnce([
      {
        text: "Translate this to French",
        attachments: [
          {
            id: "file_123",
            filename: "en-US.json",
            contentType: "application/json",
            url: "https://files.example/file_123",
          },
        ],
      },
    ]);

    await expect(interactionHasTranslationAttachments("interaction-123")).resolves.toBe(true);
  });

  it("counts stored source file markers in message text", async () => {
    interactionMessagesMock.mockResolvedValueOnce([
      {
        text: "Attached file: sourceFileId=file_123",
        attachments: null,
      },
    ]);

    await expect(interactionHasTranslationAttachments("interaction-123")).resolves.toBe(true);
  });
});
