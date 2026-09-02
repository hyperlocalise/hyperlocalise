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

import type { ContentEditorFileViewerId } from "@/components/content-editor/workspace/content-editor-file-view-capabilities";

export const contentEditorFileViewMessages = defineMessages({
  sourceHeading: {
    defaultMessage: "Source ({locale})",
    id: "LZCFkSSHP6",
    description: "Heading for the source file pane in CAT File view",
  },
  targetHeading: {
    defaultMessage: "Translated ({locale})",
    id: "VkWvhhKis5",
    description: "Heading for the translated file pane in CAT File view",
  },
  uploadFile: {
    defaultMessage: "Upload translated file",
    id: "NglzlEjVxr",
    description: "Button to upload a replacement translated file in CAT File view",
  },
  regenerate: {
    defaultMessage: "Regenerate",
    id: "xVvlWpH5FH",
    description: "Button to regenerate the translated file with the agent in CAT File view",
  },
  generate: {
    defaultMessage: "Generate",
    id: "QhDAk8yitQ",
    description: "Button to generate the first translated file with AI in CAT File view",
  },
  generateDialogTitle: {
    defaultMessage: "Generate translation",
    id: "BydbarlJgJ",
    description: "Title for the CAT file view AI generate dialog when no target exists",
  },
  regenerateDialogTitle: {
    defaultMessage: "Regenerate translation",
    id: "yXsvLbPLZX",
    description: "Title for the CAT file view AI regenerate dialog when a target exists",
  },
  generateDialogDescription: {
    defaultMessage:
      "Add optional instructions for the AI model, then generate the translated file.",
    id: "1j5qZoDR84",
    description: "Description for the CAT file view AI generate/regenerate dialog",
  },
  generatePromptLabel: {
    defaultMessage: "Instructions for the model",
    id: "iK15Pu+eHU",
    description: "Label for the optional AI prompt textarea in CAT file view generate dialog",
  },
  generatePromptPlaceholderImage: {
    defaultMessage: "e.g. Keep the logo unchanged and translate on-screen text only.",
    id: "wGWzsLB7PP",
    description: "Placeholder for AI prompt when generating a translated image in CAT file view",
  },
  generatePromptPlaceholderVideo: {
    defaultMessage: "e.g. Keep the logo visible and match the original pacing and tone.",
    id: "nHm2321vb2",
    description: "Placeholder for AI prompt when generating a translated video in CAT file view",
  },
  generatePromptPlaceholderDocument: {
    defaultMessage: "e.g. Keep product names in English and preserve MDX components.",
    id: "XeXZ1sE3tK",
    description:
      "Placeholder for AI prompt when generating a translated Markdown/MDX document in CAT file view",
  },
  generatePromptPlaceholderDocx: {
    defaultMessage: "e.g. Preserve heading styles and leave company names untranslated.",
    id: "IbH+KBJEVh",
    description:
      "Placeholder for AI prompt when generating a translated Word file in CAT file view",
  },
  generatePromptPlaceholderXlsx: {
    defaultMessage: "e.g. Keep column headers formal and do not translate formula cells.",
    id: "Sgqu6sf3FE",
    description:
      "Placeholder for AI prompt when generating a translated spreadsheet in CAT file view",
  },
  generatePromptPlaceholderPptx: {
    defaultMessage: "e.g. Keep speaker notes concise and preserve slide layout.",
    id: "7F+nlF4WOX",
    description:
      "Placeholder for AI prompt when generating a translated presentation in CAT file view",
  },
  generatePromptPlaceholderDefault: {
    defaultMessage: "e.g. Add tone, terminology, or layout preferences for the model.",
    id: "VFu590psFB",
    description: "Fallback placeholder for AI prompt in CAT file view generate dialog",
  },
  generateDialogCancel: {
    defaultMessage: "Cancel",
    id: "06WDA4hoab",
    description: "Cancel button in the CAT file view AI generate dialog",
  },
  saveEdits: {
    defaultMessage: "Save edits",
    id: "gXL7Y0+DUP",
    description: "Button to export Univer edits and upload the translated office file",
  },
  approve: {
    defaultMessage: "Approve",
    id: "NXryL5pUgk",
    description: "Primary action to approve the translated file in CAT File view",
  },
  previewUnsupported: {
    defaultMessage: "Preview is not available for this file type yet.",
    id: "x8Rt8oWLMk",
    description: "Empty state when CAT File view has no registered preview adapter",
  },
  sourceEmpty: {
    defaultMessage: "Source file unavailable",
    id: "1c3qg2u74K",
    description: "Empty state when the CAT File view source preview cannot be shown",
  },
  targetEmpty: {
    defaultMessage: "No translated file yet",
    id: "3wxYCVb3wu",
    description: "Empty state when the CAT File view target preview has no file",
  },
  documentLoadFailed: {
    defaultMessage: "Could not load the translated file",
    id: "GYiDdOqYU0",
    description: "Error when CAT document viewer fails to fetch an existing target file",
  },
  documentFrontmatter: {
    defaultMessage: "Document properties",
    id: "IBYpVWNrJA",
    description:
      "Heading for YAML metadata fields at the top of a Markdown/MDX document in CAT file view",
  },
  documentBody: {
    defaultMessage: "Body",
    id: "90JdQQe9zz",
    description: "Heading for the Markdown/MDX body editor in CAT document view",
  },
  documentEditorAria: {
    defaultMessage: "Translated document",
    id: "ooqPdhd9NW",
    description:
      "Accessible label for the raw Markdown/MDX document editor in Content Editor File view",
  },
  imageSourceAlt: {
    defaultMessage: "Source image",
    id: "86pJK6MuXF",
    description: "Alt text for the source image in CAT File view",
  },
  imageTargetAlt: {
    defaultMessage: "Translated image",
    id: "GWzwxQbAhe",
    description: "Alt text for the translated image in CAT File view",
  },
  previousFileAria: {
    defaultMessage: "Previous file",
    id: "tUQYErY0nj",
    description: "Accessible label for previous-file navigation in CAT File view",
  },
  nextFileAria: {
    defaultMessage: "Next file",
    id: "ShnGyATeRG",
    description: "Accessible label for next-file navigation in CAT File view",
  },
});

export function contentEditorFileGeneratePromptPlaceholderMessage(
  viewerId: ContentEditorFileViewerId | null,
) {
  switch (viewerId) {
    case "image":
      return contentEditorFileViewMessages.generatePromptPlaceholderImage;
    case "video":
      return contentEditorFileViewMessages.generatePromptPlaceholderVideo;
    case "markdown":
      return contentEditorFileViewMessages.generatePromptPlaceholderDocument;
    case "docx":
      return contentEditorFileViewMessages.generatePromptPlaceholderDocx;
    case "xlsx":
      return contentEditorFileViewMessages.generatePromptPlaceholderXlsx;
    case "pptx":
      return contentEditorFileViewMessages.generatePromptPlaceholderPptx;
    default:
      return contentEditorFileViewMessages.generatePromptPlaceholderDefault;
  }
}
