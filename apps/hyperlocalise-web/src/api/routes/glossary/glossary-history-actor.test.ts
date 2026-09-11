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

import { actorDisplayName } from "./glossary-history-actor";

describe("glossary history actor display name", () => {
  it("uses the joined first and last name when present", () => {
    expect(actorDisplayName("user", "user-1", "Ada", "Lovelace", "ada@example.com")).toBe(
      "Ada Lovelace",
    );
  });

  it("uses email for a living user without a name", () => {
    expect(actorDisplayName("user", "user-1", null, null, "ada@example.com")).toBe(
      "ada@example.com",
    );
  });

  it("does not label a nameless living user as deleted", () => {
    expect(actorDisplayName("user", "user-1", null, "", null)).toBe("user");
  });

  it("labels a user event as deleted after ON DELETE SET NULL", () => {
    expect(actorDisplayName("user", null, null, null, null)).toBe("Deleted user");
  });

  it("keeps non-user actor kinds", () => {
    expect(actorDisplayName("system", null, null, null, null)).toBe("system");
  });
});
