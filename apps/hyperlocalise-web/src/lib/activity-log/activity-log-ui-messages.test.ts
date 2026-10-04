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
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { activityLogEventTypeLabels } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/settings/_components/activity-log-event-type-filter";
import { activityLogEventActions } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/settings/_components/activity-log-list";

import { IMPLEMENTED_ACTIVITY_EVENT_TYPES } from "./activity-log-contract";

const catalog = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "../../../lang/en-US.json"), "utf8"),
) as Record<string, { defaultMessage?: string }>;

describe("activity log UI messages", () => {
  it("gives every implemented event a catalog id for the list action and filter label", () => {
    for (const eventType of IMPLEMENTED_ACTIVITY_EVENT_TYPES) {
      const action = activityLogEventActions[eventType];
      const label = activityLogEventTypeLabels[eventType];

      expect(action.id, `${eventType} action`).toEqual(expect.any(String));
      expect(action.id).not.toBe("");
      expect(catalog[action.id!]?.defaultMessage).toBe(action.defaultMessage);

      expect(label.id, `${eventType} filter label`).toEqual(expect.any(String));
      expect(label.id).not.toBe("");
      expect(catalog[label.id!]?.defaultMessage).toBe(label.defaultMessage);
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
