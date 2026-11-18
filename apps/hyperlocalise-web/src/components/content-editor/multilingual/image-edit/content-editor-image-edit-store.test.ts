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
import { MAX_IMAGE_EDIT_REFERENCES } from "@/lib/projects/files/image-edit";
import { describe, expect, it } from "vite-plus/test";

import { imageEditRequest } from "./content-editor-image-edit-canvas";
import {
  ContentEditorImageEditStore,
  IMAGE_EDIT_BRUSH_SIZES,
} from "./content-editor-image-edit-store";

const target = { segmentId: "hero", locale: "fr" };

describe("image edit store", () => {
  it("draws on one locale image at a time", () => {
    const store = new ContentEditorImageEditStore();
    store.begin(target, "markup");

    expect(store.toolFor("hero", "fr")).toBe("markup");
    expect(store.toolFor("hero", "de")).toBeNull();

    store.startStroke({ x: 0.1, y: 0.1 });
    store.begin({ segmentId: "hero", locale: "de" }, "erase");
    expect(store.toolFor("hero", "fr")).toBeNull();
    expect(store.strokes).toEqual([]);
  });

  it("applies markup only once strokes and an instruction exist", () => {
    const store = new ContentEditorImageEditStore();
    store.begin(target, "markup");
    store.setBrush("large");
    store.startStroke({ x: 0.1, y: 0.2 });
    store.extendStroke({ x: 0.3, y: 0.4 });
    expect(store.canApply).toBe(false);

    store.setInstruction("Make the price bigger");
    expect(store.canApply).toBe(true);

    const taken = store.takeDrawing();
    expect(taken).toEqual({
      target,
      drawing: {
        kind: "markup",
        instruction: "Make the price bigger",
        strokes: [
          {
            size: IMAGE_EDIT_BRUSH_SIZES.large,
            points: [
              { x: 0.1, y: 0.2 },
              { x: 0.3, y: 0.4 },
            ],
          },
        ],
      },
    });
    expect(store.tool).toBeNull();
    expect(store.takeDrawing()).toBeNull();
  });

  it("pins notes, undoes the last one and keeps note numbers in the request", () => {
    const store = new ContentEditorImageEditStore();
    store.begin(target, "comment");
    store.addPin({ x: 0.5, y: 0.5 });
    expect(store.editingPin).toBe(0);
    expect(store.canApply).toBe(false);

    store.setPinText(0, "Use dong");
    store.addPin({ x: 0.2, y: 0.8 });
    store.undo();
    expect(store.pins).toHaveLength(1);

    const taken = store.takeDrawing();
    expect(taken && imageEditRequest(taken.drawing)).toEqual({
      kind: "comment",
      notes: ["Use dong"],
    });
  });

  it("adds reference images to a note, up to the edit's limit, and applies with them alone", () => {
    const store = new ContentEditorImageEditStore();
    store.begin(target, "comment");
    store.addPin({ x: 0.5, y: 0.5 });
    const image = () => new Blob(["x"], { type: "image/png" });

    store.addReferences(0, [image(), new Blob(["x"], { type: "text/plain" })]);
    expect(store.pins[0]?.references).toHaveLength(1);
    expect(store.canApply).toBe(true);

    store.addPin({ x: 0.1, y: 0.1 });
    store.addReferences(1, Array.from({ length: 12 }, image));
    expect(store.pins[1]?.references).toHaveLength(MAX_IMAGE_EDIT_REFERENCES - 1);
    expect(store.referencesLeft).toBe(0);

    store.removeReference(1, 0);
    expect(store.referencesLeft).toBe(1);

    const taken = store.takeDrawing();
    expect(taken && imageEditRequest(taken.drawing)).toEqual({
      kind: "comment",
      notes: ["", ""],
      noteReferences: [1, MAX_IMAGE_EDIT_REFERENCES - 2],
    });
  });

  it("erases without an instruction", () => {
    const store = new ContentEditorImageEditStore();
    store.begin(target, "erase");
    expect(store.canApply).toBe(false);
    store.startStroke({ x: 0.5, y: 0.5 });

    const taken = store.takeDrawing();
    expect(taken && imageEditRequest(taken.drawing)).toEqual({ kind: "erase" });
  });
});
