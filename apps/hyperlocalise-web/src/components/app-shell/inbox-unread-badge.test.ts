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

import { formatInboxUnreadBadgeLabel } from "./inbox-unread-badge";

describe("formatInboxUnreadBadgeLabel", () => {
  it("hides the badge when there are no unread items", () => {
    expect(formatInboxUnreadBadgeLabel(0)).toBeNull();
    expect(formatInboxUnreadBadgeLabel(-1)).toBeNull();
  });

  it("shows exact counts from 1 through 9", () => {
    expect(formatInboxUnreadBadgeLabel(1)).toBe("1");
    expect(formatInboxUnreadBadgeLabel(9)).toBe("9");
  });

  it("caps counts above 9 as 9+", () => {
    expect(formatInboxUnreadBadgeLabel(10)).toBe("9+");
    expect(formatInboxUnreadBadgeLabel(99)).toBe("9+");
  });
});
