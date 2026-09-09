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

export const imageViewerMessages = defineMessages({
  emptyTarget: {
    id: "c7KonZLTYP",
    defaultMessage: "No localised image yet",
    description: "Empty localised image preview",
  },
  layers: {
    id: "760ijsB7PC",
    defaultMessage: "Text layers",
    description: "Image viewer: layers",
  },
  extract: {
    id: "nQ/cabfGiF",
    defaultMessage: "Extract text",
    description: "Image viewer: extract",
  },
  extracting: {
    id: "anai4NKpx3",
    defaultMessage: "Extracting text…",
    description: "Image viewer: extracting",
  },
  save: {
    id: "WYgLOUJFzG",
    defaultMessage: "Save layers",
    description: "Image viewer: save",
  },
  saving: {
    id: "kY6WTj458b",
    defaultMessage: "Saving layers…",
    description: "Image viewer: saving",
  },
  saved: {
    id: "QvT2rHSxpM",
    defaultMessage: "Layers saved",
    description: "Image viewer: saved",
  },
  unsaved: {
    id: "vB9oObJ76R",
    defaultMessage: "Your text-layer edits will be saved before localising the image.",
    description: "Image viewer: unsaved",
  },
  empty: {
    id: "OrpMTG5mZS",
    defaultMessage: "No text detected in this image.",
    description: "Image viewer: empty",
  },
  intro: {
    id: "4+iGyn4eZY",
    defaultMessage: "Extract text to refine the translation in your image.",
    description: "Image viewer: intro",
  },
  external: {
    id: "p8MuEb8/sX",
    defaultMessage: "Text extraction is available for images stored in this project.",
    description: "Image viewer: external",
  },
  loadError: {
    id: "ZgXbplvf/Z",
    defaultMessage: "Could not load text layers. Try again.",
    description: "Image viewer: loadError",
  },
  extractError: {
    id: "u1tHtBGVvs",
    defaultMessage: "Could not extract text. Try again.",
    description: "Image viewer: extractError",
  },
  saveError: {
    id: "1KrZsg7J3I",
    defaultMessage: "Could not save text layers. Your edits are still here.",
    description: "Image viewer: saveError",
  },
  conflict: {
    id: "/4UJ9goNda",
    defaultMessage: "The image or text layers changed. Reload layers before saving.",
    description: "Image viewer: conflict",
  },
  reload: {
    id: "O7B5and18u",
    defaultMessage: "Reload layers",
    description: "Image viewer: reload",
  },
  retry: {
    id: "MultLui5z7",
    defaultMessage: "Try again",
    description: "Image viewer: retry",
  },
  sourceText: {
    id: "olXGYHoMbg",
    defaultMessage: "Source text",
    description: "Image viewer: sourceText",
  },
  replacement: {
    id: "+iVUoB8aZ/",
    defaultMessage: "Exact replacement ({locale})",
    description: "Image viewer: replacement",
  },
  instructions: {
    id: "h16iXXpfNT",
    defaultMessage: "Layer instructions ({locale})",
    description: "Image viewer: instructions",
  },
  replacementHint: {
    id: "2oKQYYsRpg",
    defaultMessage: "Leave empty to adapt the text automatically",
    description: "Image viewer: replacementHint",
  },
  instructionsHint: {
    id: "sedqGJj8OE",
    defaultMessage: "For example: keep the brand name in English",
    description: "Image viewer: instructionsHint",
  },
  select: {
    id: "8o/8VWL1QB",
    defaultMessage: "Select text layer {index}",
    description: "Image viewer: select",
  },
  region: {
    id: "no/lSfBlo9",
    defaultMessage: "Layer {index}",
    description: "Image viewer: region",
  },
  noSelection: {
    id: "iDTT0c9xDP",
    defaultMessage: "Select a text region to review its wording.",
    description: "Image viewer: noSelection",
  },
  wipe: {
    id: "cm/W8QZ3Xu",
    defaultMessage: "Overlay comparison",
    description: "Image viewer: wipe",
  },
  wipePosition: {
    id: "QnUQx0BXKS",
    defaultMessage: "Original and localised image divider",
    description: "Image viewer: wipePosition",
  },
  zoom: { id: "ALGNLtky0A", defaultMessage: "Image zoom", description: "Image viewer: zoom" },
  fit: { id: "Bqk3bamIsK", defaultMessage: "Fit", description: "Image viewer: fit" },
  original: {
    id: "fmu4X2/dDf",
    defaultMessage: "Original \u00b7 {locale}",
    description: "Image viewer: original",
  },
  translated: {
    id: "5SlpWPp/9C",
    defaultMessage: "Localised \u00b7 {locale}",
    description: "Image viewer: translated",
  },
  noTarget: {
    id: "ZnePSPl942",
    defaultMessage:
      "Localise this image or upload a localised version to compare it with the original.",
    description: "Image viewer: noTarget",
  },
  imageError: {
    id: "3vnC1xz006",
    defaultMessage: "Could not load this image.",
    description: "Image viewer: imageError",
  },
  showLayers: {
    id: "0PkHdvb57G",
    defaultMessage: "Show text regions",
    description: "Image viewer: showLayers",
  },
  hideLayers: {
    id: "PoGhgzaxt/",
    defaultMessage: "Hide text regions",
    description: "Image viewer: hideLayers",
  },
  inferred: {
    id: "cn+TtDgCl5",
    defaultMessage: "Detected regions are approximate. Review the text before generating.",
    description: "Image viewer: inferred",
  },
  sourceView: {
    id: "5nMGAs/8dj",
    defaultMessage: "Original",
    description: "Image viewer: sourceView",
  },
  targetView: {
    id: "A+saX6e160",
    defaultMessage: "Localised",
    description: "Image viewer: targetView",
  },
  differentSizes: {
    id: "qmb/TOVO4K",
    defaultMessage: "Images have different proportions. Use the original pane to compare them.",
    description: "Image viewer: differentSizes",
  },
  localise: {
    id: "9TekTcXyPW",
    defaultMessage: "Localise image",
    description: "Image viewer: localise",
  },
  regenerate: {
    id: "hX5nMex6ry",
    defaultMessage: "Regenerate image",
    description: "Image viewer: regenerate",
  },
  saveLocalise: {
    id: "bIhHNqhcPu",
    defaultMessage: "Save & localise",
    description: "Image viewer: saveLocalise",
  },
  saveRegenerate: {
    id: "vonS0Ty/WO",
    defaultMessage: "Save & regenerate",
    description: "Image viewer: saveRegenerate",
  },
  localising: {
    id: "udZvNdZyMU",
    defaultMessage: "Localising image…",
    description: "Image viewer: localising",
  },
  upload: {
    id: "9ucJULG+7s",
    defaultMessage: "Upload localised image",
    description: "Image viewer: upload",
  },
  sourceAlt: {
    id: "HkZJ6qtPKE",
    defaultMessage: "Original image",
    description: "Image viewer: sourceAlt",
  },
  targetAlt: {
    id: "kVGz9stAFw",
    defaultMessage: "Localised image",
    description: "Image viewer: targetAlt",
  },
  comparisonAlt: {
    id: "lfBcHAAQiY",
    defaultMessage: "Original and localised image comparison",
    description: "Image viewer: comparisonAlt",
  },
  generateDescription: {
    id: "yeGOLY++rb",
    defaultMessage:
      "Adapt this image for {locale}, including its wording, tone, cultural context, and layout.",
    description: "Image viewer: generateDescription",
  },
  layerContext: {
    id: "Ljer+URKhu",
    defaultMessage:
      "Uses {count, plural, one {# text layer} other {# text layers}} with your saved wording and instructions.",
    description: "Image viewer: layerContext",
  },
  noLayerContext: {
    id: "AURVSCrpqB",
    defaultMessage:
      "Uses the original image. Extract text layers first when you need exact wording or replacements.",
    description: "Image viewer: noLayerContext",
  },
  additionalInstructions: {
    id: "GIDnN6ezS4",
    defaultMessage: "Additional image instructions",
    description: "Image viewer: additionalInstructions",
  },
  additionalPlaceholder: {
    id: "lIRYmBIWre",
    defaultMessage:
      "For example: adapt the tone for this audience, keep the logo, and preserve the colour palette.",
    description: "Image viewer: additionalPlaceholder",
  },
  generationError: {
    id: "9PKFI8itjo",
    defaultMessage: "Could not localise the image. Your instructions are preserved; try again.",
    description: "Image viewer: generationError",
  },
  previewOutdated: {
    id: "4z9+RgG2Ms",
    defaultMessage:
      "Text layers have changed. Regenerate the image to apply them before approving.",
    description: "Image viewer: previewOutdated",
  },
  dividerValue: {
    id: "Qn80+iLAtK",
    defaultMessage: "{value}% original image",
    description: "Image viewer: dividerValue",
  },
  dividerHint: {
    id: "jYMeyODyPY",
    defaultMessage: "Drag the divider to compare. Use arrow keys when focused.",
    description: "Image viewer: dividerHint",
  },
});
