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

import { imageEditPrompt, imageEditRequestSchema, imageEditUsesMask } from "./image-edit";

describe("image edit requests", () => {
  it("requires an instruction for markup and a note for comment", () => {
    expect(imageEditRequestSchema.safeParse({ kind: "markup" }).success).toBe(false);
    expect(imageEditRequestSchema.safeParse({ kind: "markup", instruction: "  " }).success).toBe(
      false,
    );
    expect(imageEditRequestSchema.safeParse({ kind: "comment", notes: [""] }).success).toBe(false);
    expect(
      imageEditRequestSchema.safeParse({ kind: "comment", notes: ["", "Bigger"] }).success,
    ).toBe(true);
    expect(imageEditRequestSchema.safeParse({ kind: "erase" }).success).toBe(true);
    expect(imageEditRequestSchema.safeParse({ kind: "resize" }).success).toBe(false);
  });

  it("numbers comment notes by their pin, skipping empty ones", () => {
    const prompt = imageEditPrompt({
      kind: "comment",
      notes: ["Use the VND price", "", "Drop it"],
    });

    expect(prompt).toContain("1. Use the VND price");
    expect(prompt).toContain("3. Drop it");
    expect(prompt).not.toContain("2.");
  });

  it("keeps the markup instruction and only masks erases", () => {
    expect(imageEditPrompt({ kind: "markup", instruction: "Swap the logo" })).toContain(
      "Change: Swap the logo",
    );
    expect(imageEditUsesMask("erase")).toBe(true);
    expect(imageEditUsesMask("markup")).toBe(false);
    expect(imageEditUsesMask("removeBackground")).toBe(false);
  });
});
