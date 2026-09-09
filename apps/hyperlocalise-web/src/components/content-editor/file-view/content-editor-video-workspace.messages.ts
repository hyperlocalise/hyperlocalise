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

export const videoWorkspaceMessages = defineMessages({
  unavailable: {
    id: "yfGa8F3kFv",
    defaultMessage: "AI refinement is unavailable for this workspace.",
    description: "Video refinement requires an available generation action",
  },
  listenOriginal: {
    id: "8j01gG1+e9",
    defaultMessage: "Listen to original",
    description: "Select original video audio for comparison",
  },
  listenTranslation: {
    id: "NU1Fdr2HZC",
    defaultMessage: "Listen to translation",
    description: "Select translated video audio for comparison",
  },
  original: {
    id: "tLAjYLsjYV",
    defaultMessage: "Original",
    description: "Video refinement workspace: original",
  },
  translated: {
    id: "eN54xrY8Cm",
    defaultMessage: "Translated",
    description: "Video refinement workspace: translated",
  },
  sound: {
    id: "PfAPab95R8",
    defaultMessage: "Sound",
    description: "Video refinement workspace: sound",
  },
  text: {
    id: "qAcgmfwKDM",
    defaultMessage: "On-screen text",
    description: "Video refinement workspace: text",
  },
  refine: {
    id: "UNee5IDZlj",
    defaultMessage: "Refine translation",
    description: "Video refinement workspace: refine",
  },
  intro: {
    id: "RLoOYF9XsY",
    defaultMessage: "Fine-tune the voice. Make every word fit.",
    description: "Video refinement workspace: intro",
  },
  soundHint: {
    id: "Im/lBlp8FY",
    defaultMessage: "Sound direction is applied when you generate a new version.",
    description: "Video refinement workspace: soundHint",
  },
  preserveSpeech: {
    id: "1ExZP1KV4o",
    defaultMessage: "Keep original speech",
    description: "Video refinement workspace: preserveSpeech",
  },
  preserveHint: {
    id: "mueYt91aj/",
    defaultMessage: "Leave spoken audio in its original language.",
    description: "Video refinement workspace: preserveHint",
  },
  voice: {
    id: "l3r214k18t",
    defaultMessage: "Voice & pacing",
    description: "Video refinement workspace: voice",
  },
  voicePlaceholder: {
    id: "yATVGZQ+d9",
    defaultMessage: "A warm, conversational voice. Leave a short pause after the opening line.",
    description: "Video refinement workspace: voicePlaceholder",
  },
  background: {
    id: "eB4ZuVoH50",
    defaultMessage: "Music & background",
    description: "Video refinement workspace: background",
  },
  backgroundPlaceholder: {
    id: "jADseoHprQ",
    defaultMessage: "Keep the music and ambience. Lower the music under speech.",
    description: "Video refinement workspace: backgroundPlaceholder",
  },
  extract: {
    id: "/Y9GJUEqGi",
    defaultMessage: "Extract text at playhead",
    description: "Video refinement workspace: extract",
  },
  extracting: {
    id: "uyOcKxzNqN",
    defaultMessage: "Extracting frame\u2026",
    description: "Video refinement workspace: extracting",
  },
  textHint: {
    id: "wyP/Eip1fe",
    defaultMessage: "Pause on a frame with text, then extract the elements you want to refine.",
    description: "Video refinement workspace: textHint",
  },
  frameHint: {
    id: "SILSg8DOrV",
    defaultMessage:
      "Extracts the original frame only. Review the wording and timestamp before generating.",
    description: "Video refinement workspace: frameHint",
  },
  add: {
    id: "VDvLBw/7C6",
    defaultMessage: "Add text manually",
    description: "Video refinement workspace: add",
  },
  sourceText: {
    id: "wkANc2ZtGc",
    defaultMessage: "Original text",
    description: "Video refinement workspace: sourceText",
  },
  replacement: {
    id: "vQcc6WlwJ/",
    defaultMessage: "Exact replacement ({locale})",
    description: "Video refinement workspace: replacement",
  },
  replacementHint: {
    id: "nGhHgq3gXR",
    defaultMessage: "Leave blank to translate automatically.",
    description: "Video refinement workspace: replacementHint",
  },
  keep: {
    id: "bs3S9PKHtj",
    defaultMessage: "Keep this text unchanged",
    description: "Video refinement workspace: keep",
  },
  remove: {
    id: "UFkjoS7NyA",
    defaultMessage: "Remove element",
    description: "Video refinement workspace: remove",
  },
  element: {
    id: "YjdAJSrtAi",
    defaultMessage: "Text element {index}",
    description: "Video refinement workspace: element",
  },
  emptyText: {
    id: "J4A3eYJ5tj",
    defaultMessage: "No text elements yet",
    description: "Video refinement workspace: emptyText",
  },
  noText: {
    id: "G8i44iyOrO",
    defaultMessage: "No visible text found in this frame. Try another moment or add text manually.",
    description: "Video refinement workspace: noText",
  },
  extractError: {
    id: "IzkwmsbNvz",
    defaultMessage:
      "Could not extract this frame. Pause the original video and try again, or add text manually.",
    description: "Video refinement workspace: extractError",
  },
  external: {
    id: "gtAnYKuU/R",
    defaultMessage:
      "Frame extraction is available for videos uploaded to this project. You can add text manually.",
    description: "Video refinement workspace: external",
  },
  generate: {
    id: "faIyp6TTsx",
    defaultMessage: "Generate translation",
    description: "Video refinement workspace: generate",
  },
  regenerate: {
    id: "P2TLmiPIxh",
    defaultMessage: "Generate new version",
    description: "Video refinement workspace: regenerate",
  },
  generating: {
    id: "ANXF+GhYTY",
    defaultMessage: "Generating video\u2026",
    description: "Video refinement workspace: generating",
  },
  generateHint: {
    id: "1z2NqS5zgl",
    defaultMessage: "Your refinements apply to a new video. Generation may take a few minutes.",
    description: "Video refinement workspace: generateHint",
  },
  generateError: {
    id: "Dp3sckcp/H",
    defaultMessage: "Generation failed. Your refinements are still here; try again.",
    description: "Video refinement workspace: generateError",
  },
  dirty: {
    id: "ilLIBKFjbk",
    defaultMessage: "Unapplied refinements",
    description: "Video refinement workspace: dirty",
  },
  clean: {
    id: "OCCQeJoWSL",
    defaultMessage: "Ready to review",
    description: "Video refinement workspace: clean",
  },
  draftHint: {
    id: "RAjERxjtJr",
    defaultMessage:
      "Refinements stay in this workspace until you generate. Generate before leaving to apply them.",
    description: "Video refinement workspace: draftHint",
  },
  emptyTarget: {
    id: "c6vkk09AlE",
    defaultMessage: "No translated file yet",
    description: "Video refinement workspace: emptyTarget",
  },
  emptyTargetHint: {
    id: "Zz4T4qAUT4",
    defaultMessage:
      "Review the original, adjust sound or text, then generate your first translation.",
    description: "Video refinement workspace: emptyTargetHint",
  },
  loading: {
    id: "GpAqGi0E/I",
    defaultMessage: "Loading video\u2026",
    description: "Video refinement workspace: loading",
  },
  mediaError: {
    id: "8TEiv4VOyd",
    defaultMessage: "This video could not be played. Try reloading the preview.",
    description: "Video refinement workspace: mediaError",
  },
  retry: {
    id: "jnFdq7up9c",
    defaultMessage: "Reload preview",
    description: "Video refinement workspace: retry",
  },
  seek: {
    id: "9yCRHq3iKR",
    defaultMessage: "Video playhead",
    description: "Video refinement workspace: seek",
  },
  timeline: {
    id: "TwbSmJXrM3",
    defaultMessage: "Review timeline",
    description: "Video refinement workspace: timeline",
  },
  timelineHint: {
    id: "SpUDjYg0OG",
    defaultMessage: "Select a text element to jump to its reference frame.",
    description: "Video refinement workspace: timelineHint",
  },
  download: {
    id: "DoGk1GPTBy",
    defaultMessage: "Download video",
    description: "Video refinement workspace: download",
  },
  limit: {
    id: "eqUM05Hftm",
    defaultMessage:
      "This workspace supports up to {count} text elements. Remove an element before adding more.",
    description: "Video refinement workspace: limit",
  },
  length: {
    id: "LOtScd/gFK",
    defaultMessage:
      "These refinements are too long. Shorten the text or directions before generating.",
    description: "Video refinement workspace: length",
  },
  listenHint: {
    id: "bmkBpNPbnu",
    defaultMessage:
      "Player volume changes your preview only. Use Sound to direct the generated audio.",
    description: "Video refinement workspace: listenHint",
  },
  pending: {
    id: "naIxnIgyHB",
    defaultMessage: "Review after generation",
    description: "Video refinement workspace: pending",
  },
  readOnly: {
    id: "1/q2vPpCOT",
    defaultMessage: "You have view-only access to this video.",
    description: "Video refinement workspace: readOnly",
  },
  at: {
    id: "q4WnfaCzcx",
    defaultMessage: "At {time}",
    description: "Video refinement workspace: at",
  },
});
