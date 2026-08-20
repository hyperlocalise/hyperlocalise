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

import { moveColumnIdInGroup } from "./project-issue-columns-order";

describe("moveColumnIdInGroup", () => {
  it("swaps within a group without crossing the other group", () => {
    expect(
      moveColumnIdInGroup(
        ["priority", "context", "sprint", "component"],
        ["sprint", "component"],
        "sprint",
        1,
      ),
    ).toEqual(["priority", "context", "component", "sprint"]);
  });

  it("swaps interleaved group members in place", () => {
    expect(
      moveColumnIdInGroup(
        ["priority", "sprint", "context", "component"],
        ["sprint", "component"],
        "sprint",
        1,
      ),
    ).toEqual(["priority", "component", "context", "sprint"]);
  });

  it("does not move past the edge of the displayed group", () => {
    expect(
      moveColumnIdInGroup(
        ["priority", "context", "sprint", "component"],
        ["sprint", "component"],
        "sprint",
        -1,
      ),
    ).toBeNull();
    expect(
      moveColumnIdInGroup(
        ["priority", "owner_note", "context", "sprint"],
        ["priority", "owner_note", "context"],
        "context",
        1,
      ),
    ).toBeNull();
  });
});
