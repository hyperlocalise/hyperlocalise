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
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";

export function trackNativeCatTranslationProductUsage(input: { approve?: boolean }) {
  serverAnalytics.track(
    input.approve
      ? PRODUCT_USAGE_ANALYTICS_EVENTS.contentEditorSegmentApproved
      : PRODUCT_USAGE_ANALYTICS_EVENTS.contentEditorSegmentDraftSaved,
    {
      source: "native",
      status: input.approve ? "approved" : "draft",
    },
  );
}

export function trackNativeCatCommentProductUsage(input: { type?: "comment" | "issue" }) {
  serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.contentEditorCommentCreated, {
    source: "native",
    feature: input.type === "issue" ? "issue" : "comment",
  });
}
