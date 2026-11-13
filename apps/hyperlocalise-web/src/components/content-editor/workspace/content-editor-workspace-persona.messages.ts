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

export const contentEditorWorkspacePersonaMessages = defineMessages({
  personaSwitcherAria: {
    defaultMessage: "Workspace mode",
    id: "CpSuBpt6f9",
    description: "Accessible label for the workspace persona (layout preset) switcher",
  },
  translatorPersona: {
    defaultMessage: "Translator",
    id: "YCP+NsYk19",
    description:
      "Workspace persona optimised for string translation with queue, editor, and intelligence panels",
  },
  translatorPersonaDescription: {
    defaultMessage: "Queue, editor, and Translation Intelligence panels",
    id: "RKL5/xQyJD",
    description: "Description tooltip for the Translator workspace persona",
  },
  designerPersona: {
    defaultMessage: "Designer",
    id: "b2N5Ti6nmm",
    description:
      "Workspace persona optimised for visual asset localisation (images, videos, documents)",
  },
  designerPersonaDescription: {
    defaultMessage: "Full-screen visual asset comparison and upload",
    id: "/PO5w1JP7C",
    description: "Description tooltip for the Designer workspace persona",
  },
  reviewerPersona: {
    defaultMessage: "Reviewer",
    id: "rwrbMkzbhM",
    description:
      "Workspace persona with dense table layout and persistent bulk actions for QA review",
  },
  reviewerPersonaDescription: {
    defaultMessage: "Dense review table with bulk approve and QA issue tracking",
    id: "Zjsr28k65x",
    description: "Description tooltip for the Reviewer workspace persona",
  },
});
