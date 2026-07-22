/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { applyGlossaryTermToTarget } from "@/components/cat/intelligence/cat-glossary-utils";

describe("applyGlossaryTermToTarget", () => {
  it("replaces source term in target text when present", () => {
    expect(
      applyGlossaryTermToTarget("Workspace settings for Workspace", "Dang nhap Workspace", {
        source: "Workspace",
        target: "Khong gian lam viec",
        approved: true,
        forbidden: false,
      }),
    ).toBe("Dang nhap Khong gian lam viec");
  });

  it("replaces source term in source text when target is empty", () => {
    expect(
      applyGlossaryTermToTarget("Workspace settings for Workspace", "", {
        source: "Workspace",
        target: "Khong gian lam viec",
        approved: true,
        forbidden: false,
      }),
    ).toBe("Khong gian lam viec settings for Khong gian lam viec");
  });

  it("replaces every source term occurrence in target text", () => {
    expect(
      applyGlossaryTermToTarget(
        "Workspace settings for Workspace",
        "Open Workspace and Workspace",
        {
          source: "Workspace",
          target: "Khong gian lam viec",
          approved: true,
          forbidden: false,
        },
      ),
    ).toBe("Open Khong gian lam viec and Khong gian lam viec");
  });

  it("returns the glossary target when neither text contains the source term", () => {
    expect(
      applyGlossaryTermToTarget("Workspace settings for Workspace", "", {
        source: "Dashboard",
        target: "Bang dieu khien",
        approved: true,
        forbidden: false,
      }),
    ).toBe("Bang dieu khien");
  });
});
