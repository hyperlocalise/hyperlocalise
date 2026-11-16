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
import { z } from "zod";

import { assertNever } from "@/lib/primitives/assert-never/assert-never";

/**
 * Targeted AI edits to a localised image, on top of whole-image regeneration:
 * marks drawn on it (markup), numbered notes pinned to it (comment), an area
 * brushed out (erase), or its background cut away (removeBackground).
 *
 * Marks and notes are drawn onto the image that is sent, so the model sees
 * where they point. An erased area is sent as a mask, so nothing else is
 * redrawn.
 */
export const IMAGE_EDIT_KINDS = ["markup", "comment", "erase", "removeBackground"] as const;
export const imageEditKindSchema = z.enum(IMAGE_EDIT_KINDS);
export type ImageEditKind = z.infer<typeof imageEditKindSchema>;

/** The colour marks and note pins are drawn in; the model is told to take them out again. */
export const IMAGE_EDIT_MARK_COLOR = "#ff2d55";

export const MAX_IMAGE_EDIT_INSTRUCTION_LENGTH = 2000;
export const MAX_IMAGE_EDIT_NOTES = 20;

export const imageEditRequestSchema = z
  .object({
    kind: imageEditKindSchema,
    instruction: z.string().trim().max(MAX_IMAGE_EDIT_INSTRUCTION_LENGTH).optional(),
    notes: z
      .array(z.string().trim().max(MAX_IMAGE_EDIT_INSTRUCTION_LENGTH))
      .max(MAX_IMAGE_EDIT_NOTES)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "markup" && !value.instruction) {
      ctx.addIssue({ code: "custom", path: ["instruction"], message: "Required" });
    }
    if (value.kind === "comment" && !value.notes?.some(Boolean)) {
      ctx.addIssue({ code: "custom", path: ["notes"], message: "Required" });
    }
  });
export type ImageEditRequest = z.infer<typeof imageEditRequestSchema>;

/** Whether the edit is sent with a mask of the area to redraw. */
export function imageEditUsesMask(kind: ImageEditKind): boolean {
  return kind === "erase";
}

const KEEP_REST = "Leave the rest of the image exactly as it is, including all localised text.";

export function imageEditPrompt(request: ImageEditRequest): string {
  switch (request.kind) {
    case "markup":
      return [
        `The ${IMAGE_EDIT_MARK_COLOR} brush strokes drawn over the image mark where to change it.`,
        `Change: ${request.instruction ?? ""}`,
        "Apply the change only where marked and remove every mark.",
        KEEP_REST,
      ].join("\n");
    case "comment": {
      const notes = (request.notes ?? [])
        .map((note, index) => ({ note, number: index + 1 }))
        .filter(({ note }) => note)
        .map(({ note, number }) => `${number}. ${note}`);
      return [
        `Numbered ${IMAGE_EDIT_MARK_COLOR} markers are pinned to the image. Make each change at its marker:`,
        ...notes,
        "Remove every marker.",
        KEEP_REST,
      ].join("\n");
    }
    case "erase":
      return [
        "Remove what is in the transparent area of the mask and fill it in so it matches its surroundings seamlessly, as if it was never there.",
        request.instruction ?? "",
      ]
        .filter(Boolean)
        .join("\n");
    case "removeBackground":
      return [
        "Remove the background completely and return the main subject, with any text and graphics on it, on a fully transparent background.",
        "Keep the subject's edges clean and do not change the subject itself.",
      ].join("\n");
    default:
      return assertNever(request.kind);
  }
}
