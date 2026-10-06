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

import { wholeFileMatchesAdvancedQueueFilter } from "./native-content-editor-whole-file-filter";

const image = {
  contentKind: "image_file",
  hasTarget: true,
  approvalStatus: "needs_review",
  createdAt: new Date("2026-03-02T15:00:00.000Z"),
  updatedAt: new Date("2026-03-04T08:00:00.000Z"),
};

describe("wholeFileMatchesAdvancedQueueFilter", () => {
  it("keeps an unfiltered image and applies string, status, and date selections", () => {
    expect(wholeFileMatchesAdvancedQueueFilter(image, undefined)).toBe(true);
    expect(wholeFileMatchesAdvancedQueueFilter(image, { stringType: "plain" })).toBe(false);
    expect(wholeFileMatchesAdvancedQueueFilter(image, { stringType: "asset" })).toBe(true);
    expect(
      wholeFileMatchesAdvancedQueueFilter(
        { ...image, contentKind: "office_file" },
        { stringType: "asset" },
      ),
    ).toBe(false);
    expect(wholeFileMatchesAdvancedQueueFilter(image, { visibility: "hidden" })).toBe(false);
    expect(wholeFileMatchesAdvancedQueueFilter(image, { visibility: "visible" })).toBe(true);
    expect(wholeFileMatchesAdvancedQueueFilter(image, { translationStatus: "untranslated" })).toBe(
      false,
    );
    expect(wholeFileMatchesAdvancedQueueFilter(image, { translationStatus: "translated" })).toBe(
      true,
    );
    expect(wholeFileMatchesAdvancedQueueFilter(image, { approvalStatus: "approved" })).toBe(false);
    expect(wholeFileMatchesAdvancedQueueFilter(image, { approvalStatus: "not_approved" })).toBe(
      true,
    );
    expect(wholeFileMatchesAdvancedQueueFilter(image, { comments: "with" })).toBe(false);
    expect(wholeFileMatchesAdvancedQueueFilter(image, { comments: "without" })).toBe(true);
    expect(wholeFileMatchesAdvancedQueueFilter(image, { qaIssues: "with" })).toBe(false);
    expect(
      wholeFileMatchesAdvancedQueueFilter(image, {
        addedFrom: "2026-03-01",
        addedTo: "2026-03-02",
      }),
    ).toBe(true);
    expect(wholeFileMatchesAdvancedQueueFilter(image, { addedFrom: "2026-03-03" })).toBe(false);
    expect(
      wholeFileMatchesAdvancedQueueFilter(
        { contentKind: "image_file", hasTarget: false },
        { addedFrom: "2026-03-01" },
      ),
    ).toBe(false);
  });
});
