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
 * where they point. A note can carry reference images, sent after the image
 * for the model to take from. An erased area is sent as a mask, so nothing
 * else is redrawn.
 */
export const IMAGE_EDIT_KINDS = ["markup", "comment", "erase", "removeBackground"] as const;
export const imageEditKindSchema = z.enum(IMAGE_EDIT_KINDS);
export type ImageEditKind = z.infer<typeof imageEditKindSchema>;

/** The colour marks and note pins are drawn in; the model is told to take them out again. */
export const IMAGE_EDIT_MARK_COLOR = "#ff2d55";

export const MAX_IMAGE_EDIT_INSTRUCTION_LENGTH = 2000;
export const MAX_IMAGE_EDIT_NOTES = 20;
/** The most reference images one edit sends, across its notes. */
export const MAX_IMAGE_EDIT_REFERENCES = 8;

export const imageEditRequestSchema = z
  .object({
    kind: imageEditKindSchema,
    instruction: z.string().trim().max(MAX_IMAGE_EDIT_INSTRUCTION_LENGTH).optional(),
    notes: z
      .array(z.string().trim().max(MAX_IMAGE_EDIT_INSTRUCTION_LENGTH))
      .max(MAX_IMAGE_EDIT_NOTES)
      .optional(),
    /** How many reference images each note has, in note order. */
    noteReferences: z
      .array(z.number().int().min(0).max(MAX_IMAGE_EDIT_REFERENCES))
      .max(MAX_IMAGE_EDIT_NOTES)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "markup" && !value.instruction) {
      ctx.addIssue({ code: "custom", path: ["instruction"], message: "Required" });
    }
    if (value.kind === "comment" && !commentNotes(value).length) {
      ctx.addIssue({ code: "custom", path: ["notes"], message: "Required" });
    }
    const references = imageEditReferenceCount(value);
    if (references > MAX_IMAGE_EDIT_REFERENCES) {
      ctx.addIssue({ code: "custom", path: ["noteReferences"], message: "Too many references" });
    }
    if (references > 0 && value.kind !== "comment") {
      ctx.addIssue({
        code: "custom",
        path: ["noteReferences"],
        message: "Only notes take references",
      });
    }
    if ((value.noteReferences?.length ?? 0) > (value.notes?.length ?? 0)) {
      ctx.addIssue({ code: "custom", path: ["noteReferences"], message: "One count per note" });
    }
  });
export type ImageEditRequest = z.infer<typeof imageEditRequestSchema>;

/** How many reference images the edit sends, after the image. */
export function imageEditReferenceCount(request: Pick<ImageEditRequest, "noteReferences">): number {
  return (request.noteReferences ?? []).reduce((sum, count) => sum + count, 0);
}

/**
 * The notes that say something — text, or references to take from — with
 * their pin number and the numbers of their reference images. The image is
 * image 1; references follow it as images 2, 3… in note order.
 */
function commentNotes(request: Pick<ImageEditRequest, "notes" | "noteReferences">) {
  let next = 2;
  return (request.notes ?? []).flatMap((note, index) => {
    const count = request.noteReferences?.[index] ?? 0;
    const images = Array.from({ length: count }, () => next++);
    return note || images.length ? [{ note, number: index + 1, images }] : [];
  });
}

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
      const references = imageEditReferenceCount(request) > 0;
      const notes = commentNotes(request).map(({ note, number, images }) => {
        const names = images.map((image) => `image ${image}`).join(" and ");
        if (!note) return `${number}. Put what is in ${names} here.`;
        return images.length ? `${number}. ${note} (reference: ${names})` : `${number}. ${note}`;
      });
      return [
        references
          ? `Numbered ${IMAGE_EDIT_MARK_COLOR} markers are pinned to the first image, the one to edit. Make each change at its marker:`
          : `Numbered ${IMAGE_EDIT_MARK_COLOR} markers are pinned to the image. Make each change at its marker:`,
        ...notes,
        references
          ? "The other images are references only: take from them what a note asks for, matching the edited image's lighting and perspective, and copy nothing else from them."
          : "",
        "Remove every marker.",
        KEEP_REST,
      ]
        .filter(Boolean)
        .join("\n");
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
