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
import { IMAGE_EDIT_MARK_COLOR, type ImageEditRequest } from "@/lib/projects/files/image-edit";

/** A point on the image, as shares of its width and height. */
export type ImageEditPoint = { x: number; y: number };

/** A brush stroke; `size` is its width as a share of the image's width. */
export type ImageEditStroke = { points: ImageEditPoint[]; size: number };

/** A note pinned to a point of the image. */
export type ImageEditPin = ImageEditPoint & { text: string };

/** What the editor drew, ready to send with the edit request. */
export type ImageEditDrawing =
  | { kind: "markup"; strokes: ImageEditStroke[]; instruction: string }
  | { kind: "comment"; pins: ImageEditPin[] }
  | { kind: "erase"; strokes: ImageEditStroke[]; instruction?: string }
  | { kind: "removeBackground" };

/** The tallest or widest an image is sent at; the model draws at most 1536 px. */
export const IMAGE_EDIT_MAX_SIDE = 2048;

export function imageEditRequest(drawing: ImageEditDrawing): ImageEditRequest {
  switch (drawing.kind) {
    case "markup":
      return { kind: "markup", instruction: drawing.instruction.trim() };
    case "comment":
      return { kind: "comment", notes: drawing.pins.map((pin) => pin.text.trim()) };
    case "erase":
      return {
        kind: "erase",
        ...(drawing.instruction?.trim() ? { instruction: drawing.instruction.trim() } : {}),
      };
    case "removeBackground":
      return { kind: "removeBackground" };
  }
}

/** The size an image is sent at: no bigger than the model can use, aspect kept. */
export function imageEditSendSize(width: number, height: number) {
  const scale = Math.min(1, IMAGE_EDIT_MAX_SIDE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function drawImageEditStrokes(
  context: Context2D,
  strokes: readonly ImageEditStroke[],
  width: number,
  height: number,
  minWidth = 1,
) {
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const stroke of strokes) {
    const [first, ...rest] = stroke.points;
    if (!first) continue;
    context.lineWidth = Math.max(minWidth, stroke.size * width);
    context.beginPath();
    context.moveTo(first.x * width, first.y * height);
    // A tap is a dot: a line back to where it started.
    for (const point of rest.length ? rest : [first]) {
      context.lineTo(point.x * width, point.y * height);
    }
    context.stroke();
  }
}

function drawPins(
  context: Context2D,
  pins: readonly ImageEditPin[],
  width: number,
  height: number,
) {
  const radius = Math.max(10, Math.round(Math.max(width, height) * 0.02));
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `600 ${Math.round(radius * 1.1)}px sans-serif`;
  pins.forEach((pin, index) => {
    const x = pin.x * width;
    const y = pin.y * height;
    context.fillStyle = IMAGE_EDIT_MARK_COLOR;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = Math.max(2, radius * 0.18);
    context.strokeStyle = "#ffffff";
    context.stroke();
    context.fillStyle = "#ffffff";
    context.fillText(String(index + 1), x, y + 1);
  });
}

function surface(
  width: number,
  height: number,
): [OffscreenCanvas, OffscreenCanvasRenderingContext2D] {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not draw the image");
  return [canvas, context];
}

/**
 * The image to send for `drawing`, with marks and pins drawn on it, and for
 * an erase the mask: opaque everywhere except the brushed-over area.
 */
export async function prepareImageEdit(
  source: Blob,
  drawing: ImageEditDrawing,
): Promise<{ image: Blob; mask: Blob | null }> {
  const bitmap = await createImageBitmap(source);
  try {
    const { width, height } = imageEditSendSize(bitmap.width, bitmap.height);
    const [canvas, context] = surface(width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    let mask: Blob | null = null;
    if (drawing.kind === "markup") {
      context.strokeStyle = IMAGE_EDIT_MARK_COLOR;
      drawImageEditStrokes(context, drawing.strokes, width, height);
    } else if (drawing.kind === "comment") {
      drawPins(context, drawing.pins, width, height);
    } else if (drawing.kind === "erase") {
      const [maskCanvas, masking] = surface(width, height);
      masking.fillStyle = "#000000";
      masking.fillRect(0, 0, width, height);
      masking.globalCompositeOperation = "destination-out";
      masking.strokeStyle = "#000000";
      drawImageEditStrokes(masking, drawing.strokes, width, height);
      mask = await maskCanvas.convertToBlob({ type: "image/png" });
    }

    return { image: await canvas.convertToBlob({ type: "image/png" }), mask };
  } finally {
    bitmap.close();
  }
}
