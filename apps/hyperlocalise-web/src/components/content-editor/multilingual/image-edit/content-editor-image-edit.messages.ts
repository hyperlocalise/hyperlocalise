"use client";

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
import { defineMessages } from "react-intl";

export const imageEditMessages = defineMessages({
  actions: {
    defaultMessage: "Image actions for {language}",
    id: "h4xF3z4/Ja",
    description: "Accessible label for the group of edit actions under one gallery image",
  },
  editCopy: {
    defaultMessage: "Edit copy",
    id: "s0thXbPLBz",
    description: "Gallery action that opens the image's text regions and translations for review",
  },
  editCopyAria: {
    defaultMessage: "Edit the copy in the {language} image",
    id: "fTpE3qtvKL",
    description: "Accessible label for the gallery action that opens the image's copy review",
  },
  markup: {
    defaultMessage: "Markup",
    id: "LosBi/bCTX",
    description: "Gallery action that lets the user draw on the image, then describe the change",
  },
  markupHint: {
    defaultMessage: "Draw on the image, then say what to change",
    id: "xzfls07IVH",
    description: "Tooltip for the markup image edit action",
  },
  comment: {
    defaultMessage: "Comment",
    id: "6GXoIJydEr",
    description: "Gallery action that lets the user pin notes on the image to say what to change",
  },
  commentHint: {
    defaultMessage: "Pin notes where to change the image",
    id: "gsE+RsU+ja",
    description: "Tooltip for the comment image edit action",
  },
  removeBackground: {
    defaultMessage: "Remove BG",
    id: "4T61W3uI3S",
    description: "Gallery action that removes the image background",
  },
  removeBackgroundHint: {
    defaultMessage: "Cut the background out",
    id: "MU0OTjSMs5",
    description: "Tooltip for the remove background image edit action",
  },
  erase: {
    defaultMessage: "Erase",
    id: "YQ1BXljSLD",
    description: "Gallery action that lets the user brush over something to remove it",
  },
  eraseHint: {
    defaultMessage: "Brush over something to take it out",
    id: "1sL8xvlLkr",
    description: "Tooltip for the erase image edit action",
  },
  describeChange: {
    defaultMessage: "Describe the change",
    id: "86bxQj2QDA",
    description: "Placeholder and label for the markup instruction after strokes are drawn",
  },
  drawWhere: {
    defaultMessage: "Draw where to change",
    id: "sk5CC+fKTN",
    description: "Placeholder for the markup instruction before any stroke is drawn",
  },
  eraseInstruction: {
    defaultMessage: "What to fill it with (optional)",
    id: "AhUKhMQRdJ",
    description: "Placeholder for the optional instruction while erasing part of the image",
  },
  pinMore: {
    defaultMessage: "Pin more notes, or apply",
    id: "8Mi69ozdMZ",
    description: "Instruction after at least one comment pin exists on the image",
  },
  clickToPin: {
    defaultMessage: "Click the image to pin a note",
    id: "gU8vMkUMc8",
    description: "Instruction before the first comment pin is placed on the image",
  },
  brushSize: {
    defaultMessage: "Brush size",
    id: "rH+bH/w+qC",
    description: "Accessible label for the erase and markup brush size group",
  },
  brushSmall: {
    defaultMessage: "Small brush",
    id: "15XdTZEk24",
    description: "Accessible label for the small brush size",
  },
  brushMedium: {
    defaultMessage: "Medium brush",
    id: "DDi2MuKYvy",
    description: "Accessible label for the medium brush size",
  },
  brushLarge: {
    defaultMessage: "Large brush",
    id: "bIxykf6kJI",
    description: "Accessible label for the large brush size",
  },
  undo: {
    defaultMessage: "Undo",
    id: "TE7hX/QQYH",
    description: "Takes back the last stroke or pin drawn on the image",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "ThaN+qlykd",
    description: "Cancels the image edit being drawn",
  },
  apply: {
    defaultMessage: "Apply",
    id: "AloVivA2Gi",
    description: "Runs the markup or comment edit on the image",
  },
  applyErase: {
    defaultMessage: "Erase",
    id: "Ts6STfRLnf",
    description: "Runs the erase edit on the image",
  },
  note: {
    defaultMessage: "Note {number}",
    id: "r9gEKB/NGc",
    description: "Accessible label for a numbered note pinned on the image",
  },
  notePlaceholder: {
    defaultMessage: "What should change here?",
    id: "eh5g/c0/Jt",
    description: "Placeholder for the text of a note pinned on the image",
  },
  removeNote: {
    defaultMessage: "Remove note",
    id: "lxeDn/IoZe",
    description: "Removes a note pinned on the image",
  },
  addReference: {
    defaultMessage: "Add reference image",
    id: "49k1zSGHH4",
    description: "Button on an image note that attaches an image for the AI to take from",
  },
  removeReference: {
    defaultMessage: "Remove reference {number}",
    id: "HfR6ecD8Qi",
    description: "Removes one reference image from a note pinned on the image",
  },
  referenceHint: {
    defaultMessage: "Add, drop or paste images for the AI to use here",
    id: "tvFKt2Hte9",
    description: "Hint under a note pinned on the image about attaching reference images",
  },
  moreReferences: {
    defaultMessage: "+{count}",
    id: "lXCtej92/g",
    description: "How many more reference images a note has beyond the one shown",
  },
  editError: {
    defaultMessage: "Could not edit this image. Try again.",
    id: "bypuk8nZN6",
    description: "Error on a gallery card when an image edit failed",
  },
  editApprovedTitle: {
    defaultMessage: "Edit the approved {language} image?",
    id: "Q2zm5mmQK4",
    description: "Title of the confirmation dialog before editing an approved gallery image",
  },
  editApprovedDescription: {
    defaultMessage:
      "This language already has an approved image. Editing replaces it and sends it back to review.",
    id: "X3WC1ONHHK",
    description: "Explanation that editing an approved gallery image overwrites it",
  },
  editApprovedConfirm: {
    defaultMessage: "Edit image",
    id: "AHUc3cg7vi",
    description: "Confirm button that edits an approved gallery image",
  },
});
