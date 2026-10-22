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
import type { FileTreeIconConfig } from "@pierre/trees";

const WORD_ICON_ID = "file-tree-custom-word";
const POWERPOINT_ICON_ID = "file-tree-custom-powerpoint";
const PDF_ICON_ID = "file-tree-custom-pdf";

/**
 * Pierre maps `.xlsx` and `.json` in the complete set, but not `.docx` / `.pptx`.
 * Custom remaps must keep `set: "complete"` — otherwise Pierre drops every
 * built-in file icon, including spreadsheets and JSON.
 */
export const PROJECT_FILES_TREE_ICONS = {
  set: "complete",
  colored: true,
  spriteSheet: `<svg data-icon-sprite aria-hidden="true" width="0" height="0">
  <symbol id="${WORD_ICON_ID}" viewBox="0 0 16 16">
    <path fill="#185ABD" d="M8 4a3 3 0 0 0 3 3h3v5.5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 2 12.5v-9A2.5 2.5 0 0 1 4.5 1H8z"/>
    <path fill="#103F82" d="M9.5 1a.5.5 0 0 1 .354.146l4 4A.5.5 0 0 1 14 5.5V6h-3a2 2 0 0 1-2-2V1z"/>
    <path fill="#fff" d="M5.5 9h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1 0-1zm0 2h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1 0-1z"/>
  </symbol>
  <symbol id="${POWERPOINT_ICON_ID}" viewBox="0 0 16 16">
    <path fill="#C43E1C" d="M8 4a3 3 0 0 0 3 3h3v5.5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 2 12.5v-9A2.5 2.5 0 0 1 4.5 1H8z"/>
    <path fill="#8B2C14" d="M9.5 1a.5.5 0 0 1 .354.146l4 4A.5.5 0 0 1 14 5.5V6h-3a2 2 0 0 1-2-2V1z"/>
    <path fill="#fff" d="M5 8.75h6a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5z"/>
  </symbol>
  <symbol id="${PDF_ICON_ID}" viewBox="0 0 16 16">
    <path fill="#EA4335" d="M8 4a3 3 0 0 0 3 3h3v5.5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 2 12.5v-9A2.5 2.5 0 0 1 4.5 1H8z"/>
    <path fill="#C5221F" d="M9.5 1a.5.5 0 0 1 .354.146l4 4A.5.5 0 0 1 14 5.5V6h-3a2 2 0 0 1-2-2V1z"/>
    <path fill="#fff" d="M4.5 8.5h1.75a1.25 1.25 0 1 1 0 2.5H5v1.5h-.5zm1.75 1.5a.75.75 0 0 0 0-1.5H5v1.5zM9 8.5h1.25a1.25 1.25 0 0 1 0 2.5H9zm.75 1.5a.25.25 0 0 0 0-.5H9.5v.5z"/>
  </symbol>
</svg>`,
  byFileExtension: {
    doc: WORD_ICON_ID,
    docx: WORD_ICON_ID,
    ppt: POWERPOINT_ICON_ID,
    pptx: POWERPOINT_ICON_ID,
    pdf: PDF_ICON_ID,
  },
} satisfies FileTreeIconConfig;
