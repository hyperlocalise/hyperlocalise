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
import { makeAutoObservable } from "mobx";

import { MAX_IMAGE_EDIT_REFERENCES } from "@/lib/projects/files/image-edit";

import type {
  ImageEditDrawing,
  ImageEditPin,
  ImageEditPoint,
  ImageEditStroke,
} from "./content-editor-image-edit-canvas";

/** The edits that are drawn on the image before they run. */
export type ImageEditTool = "markup" | "comment" | "erase";

/** Brush widths, as shares of the image's width. */
export const IMAGE_EDIT_BRUSH_SIZES = { small: 0.012, medium: 0.03, large: 0.06 } as const;
export type ImageEditBrushSize = keyof typeof IMAGE_EDIT_BRUSH_SIZES;

/** Which locale image of which segment is being drawn on. */
export type ImageEditTarget = { segmentId: string; locale: string };

/**
 * The AI edit being drawn on one localised image in the gallery: which image,
 * with which tool, and the strokes, pins and instruction so far. One at a
 * time; applying hands the drawing over and clears it.
 */
export class ContentEditorImageEditStore {
  target: ImageEditTarget | null = null;
  tool: ImageEditTool | null = null;
  strokes: ImageEditStroke[] = [];
  pins: ImageEditPin[] = [];
  instruction = "";
  brush: ImageEditBrushSize = "medium";
  /** The pin whose note is being written. */
  editingPin: number | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  /** The tool being drawn with on `segmentId` in `locale`, if any. */
  toolFor(segmentId: string, locale: string): ImageEditTool | null {
    return this.target?.segmentId === segmentId && this.target.locale === locale ? this.tool : null;
  }

  begin(target: ImageEditTarget, tool: ImageEditTool) {
    this.clear();
    this.target = target;
    this.tool = tool;
  }

  cancel() {
    this.clear();
    this.target = null;
    this.tool = null;
  }

  setInstruction(instruction: string) {
    this.instruction = instruction;
  }

  setBrush(brush: ImageEditBrushSize) {
    this.brush = brush;
  }

  startStroke(point: ImageEditPoint) {
    this.strokes.push({ points: [point], size: IMAGE_EDIT_BRUSH_SIZES[this.brush] });
  }

  extendStroke(point: ImageEditPoint) {
    this.strokes.at(-1)?.points.push(point);
  }

  addPin(point: ImageEditPoint) {
    this.pins.push({ ...point, text: "", references: [] });
    this.editingPin = this.pins.length - 1;
  }

  setPinText(index: number, text: string) {
    const pin = this.pins[index];
    if (pin) pin.text = text;
  }

  editPin(index: number | null) {
    this.editingPin = index;
  }

  /** How many more reference images the edit can take, across its pins. */
  get referencesLeft() {
    return (
      MAX_IMAGE_EDIT_REFERENCES -
      this.pins.reduce((sum, pin) => sum + (pin.references?.length ?? 0), 0)
    );
  }

  /** Adds images to a pin's references, as many as the edit has room for. */
  addReferences(index: number, files: readonly Blob[]) {
    const pin = this.pins[index];
    if (!pin) return;
    const images = files.filter((file) => file.type.startsWith("image/"));
    pin.references = [...(pin.references ?? []), ...images.slice(0, this.referencesLeft)];
  }

  removeReference(index: number, reference: number) {
    this.pins[index]?.references?.splice(reference, 1);
  }

  removePin(index: number) {
    this.pins.splice(index, 1);
    this.editingPin = null;
  }

  /** Takes back the last stroke or pin. */
  undo() {
    if (this.tool === "comment") this.removePin(this.pins.length - 1);
    else this.strokes.pop();
  }

  get canUndo() {
    return this.tool === "comment" ? this.pins.length > 0 : this.strokes.length > 0;
  }

  /** Whether enough is drawn and said to run the edit. */
  get canApply() {
    switch (this.tool) {
      case "markup":
        return this.strokes.length > 0 && this.instruction.trim().length > 0;
      case "comment":
        return this.pins.some((pin) => pin.text.trim() || pin.references?.length);
      case "erase":
        return this.strokes.length > 0;
      default:
        return false;
    }
  }

  /**
   * Ends drawing and returns what was drawn, with its target, or null when
   * there is not enough to apply.
   */
  takeDrawing(): { target: ImageEditTarget; drawing: ImageEditDrawing } | null {
    const { target, tool } = this;
    if (!target || !tool || !this.canApply) return null;
    const strokes = this.strokes.map((stroke) => ({
      size: stroke.size,
      points: stroke.points.map((point) => ({ ...point })),
    }));
    const drawing: ImageEditDrawing =
      tool === "markup"
        ? { kind: "markup", strokes, instruction: this.instruction }
        : tool === "comment"
          ? {
              kind: "comment",
              pins: this.pins.map((pin) => ({ ...pin, references: [...(pin.references ?? [])] })),
            }
          : { kind: "erase", strokes, instruction: this.instruction };
    this.cancel();
    return { target, drawing };
  }

  private clear() {
    this.strokes = [];
    this.pins = [];
    this.instruction = "";
    this.editingPin = null;
  }
}
