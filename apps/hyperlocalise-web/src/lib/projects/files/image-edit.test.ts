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

import {
  MAX_IMAGE_EDIT_REFERENCES,
  imageEditPrompt,
  imageEditRequestSchema,
  imageEditUsesMask,
} from "./image-edit";

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
  it("names each note's reference images after the image being edited", () => {
    const prompt = imageEditPrompt({
      kind: "comment",
      notes: ["Use this logo", "", "", "Swap the price"],
      noteReferences: [1, 0, 2, 0],
    });

    expect(prompt).toContain("pinned to the first image, the one to edit");
    expect(prompt).toContain("1. Use this logo (reference: image 2)");
    expect(prompt).toContain("3. Put what is in image 3 and image 4 here.");
    expect(prompt).toContain("4. Swap the price");
    expect(prompt).not.toContain("2.");
    expect(prompt).toContain("The other images are references only");
  });

  it("accepts a note that is only references, and caps references per edit", () => {
    expect(
      imageEditRequestSchema.safeParse({ kind: "comment", notes: [""], noteReferences: [1] })
        .success,
    ).toBe(true);
    expect(
      imageEditRequestSchema.safeParse({
        kind: "comment",
        notes: ["a", "b"],
        noteReferences: [MAX_IMAGE_EDIT_REFERENCES, 1],
      }).success,
    ).toBe(false);
    expect(
      imageEditRequestSchema.safeParse({ kind: "markup", instruction: "x", noteReferences: [1] })
        .success,
    ).toBe(false);
    expect(
      imageEditRequestSchema.safeParse({ kind: "comment", notes: ["a"], noteReferences: [0, 1] })
        .success,
    ).toBe(false);
  });
});
