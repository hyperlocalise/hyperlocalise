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

import { activityLogEventTypeLabels } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/settings/_components/activity-log-event-type-filter";
import { activityLogEventActions } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/settings/_components/activity-log-list";

import { IMPLEMENTED_ACTIVITY_EVENT_TYPES } from "./activity-log-contract";

describe("activity log UI messages", () => {
  it("gives every implemented event a list action and filter label", () => {
    for (const eventType of IMPLEMENTED_ACTIVITY_EVENT_TYPES) {
      const action = activityLogEventActions[eventType];
      const label = activityLogEventTypeLabels[eventType];

      expect(action, `${eventType} action`).toBeDefined();
      expect(action.id, `${eventType} action id`).toEqual(expect.any(String));
      expect(action.id).not.toBe("");
      expect(action.defaultMessage, `${eventType} action defaultMessage`).toEqual(
        expect.any(String),
      );
      expect(action.defaultMessage).not.toBe("");

      expect(label, `${eventType} filter label`).toBeDefined();
      expect(label.id, `${eventType} filter label id`).toEqual(expect.any(String));
      expect(label.id).not.toBe("");
      expect(label.defaultMessage, `${eventType} filter label defaultMessage`).toEqual(
        expect.any(String),
      );
      expect(label.defaultMessage).not.toBe("");
    }
  });

  it("keeps extractable ids for string translation updates", () => {
    expect(activityLogEventActions.string_segment_translation_updated).toMatchObject({
      id: "ee8QZoTHdn",
      defaultMessage: "updated a translation",
    });
    expect(activityLogEventTypeLabels.string_segment_translation_updated).toMatchObject({
      id: "rGgaa02kAU",
      defaultMessage: "String Translation Updated",
    });
  });
});
