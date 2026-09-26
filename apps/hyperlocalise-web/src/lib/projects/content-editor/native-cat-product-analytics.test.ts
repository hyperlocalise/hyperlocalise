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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { trackMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
}));

vi.mock("@/lib/analytics/server", () => ({
  serverAnalytics: { track: trackMock },
}));

import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";

import {
  trackNativeCatCommentProductUsage,
  trackNativeCatTranslationProductUsage,
} from "./native-cat-product-analytics";

describe("native CAT product analytics", () => {
  afterEach(() => {
    trackMock.mockClear();
  });

  it("tracks draft saves and approvals with native source", () => {
    trackNativeCatTranslationProductUsage({});
    trackNativeCatTranslationProductUsage({ approve: true });

    expect(trackMock).toHaveBeenNthCalledWith(
      1,
      PRODUCT_USAGE_ANALYTICS_EVENTS.contentEditorSegmentDraftSaved,
      { source: "native", status: "draft" },
    );
    expect(trackMock).toHaveBeenNthCalledWith(
      2,
      PRODUCT_USAGE_ANALYTICS_EVENTS.contentEditorSegmentApproved,
      { source: "native", status: "approved" },
    );
  });

  it("tracks comments versus issue-typed CAT notes", () => {
    trackNativeCatCommentProductUsage({});
    trackNativeCatCommentProductUsage({ type: "issue" });
    trackNativeCatCommentProductUsage({ type: "comment" });

    expect(trackMock).toHaveBeenNthCalledWith(
      1,
      PRODUCT_USAGE_ANALYTICS_EVENTS.contentEditorCommentCreated,
      { source: "native", feature: "comment" },
    );
    expect(trackMock).toHaveBeenNthCalledWith(
      2,
      PRODUCT_USAGE_ANALYTICS_EVENTS.contentEditorCommentCreated,
      { source: "native", feature: "issue" },
    );
    expect(trackMock).toHaveBeenNthCalledWith(
      3,
      PRODUCT_USAGE_ANALYTICS_EVENTS.contentEditorCommentCreated,
      { source: "native", feature: "comment" },
    );
  });
});
