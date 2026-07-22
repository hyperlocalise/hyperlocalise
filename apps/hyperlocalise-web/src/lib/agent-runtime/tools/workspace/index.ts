/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
export type { RepoToolContext } from "./types";
export { redact, truncate, DEFAULT_MAX_OUTPUT_BYTES, DEFAULT_MAX_FILE_BYTES } from "./redact";
export { normalizeWorkspacePath } from "./path";
export { parseGrepLine, type GrepMatch } from "./parse-grep-line";
export { createReadTool } from "./read";
export { createGrepTool } from "./grep";
export { createFuzzySearchTool } from "./fuzzy-search";
export { createGlobTool } from "./glob";
export { createBashTool, isAllowedBashCommand } from "./bash";
export { createWriteTool } from "./write";
export { createApplyPatchTool } from "./apply-patch";
export { createCaptureScreenshotTool } from "./capture-screenshot";
export {
  convertHTMLToMarkdown,
  createFetchTool,
  extractTextFromHTML,
  isAllowedWebUrl,
} from "./fetch";
export { createTodoWriteTool } from "./todo";

export const workspacePrimitiveToolNames = [
  "read",
  "grep",
  "fuzzySearch",
  "glob",
  "bash",
  "write",
  "applyPatch",
  "captureScreenshot",
  "fetch",
] as const;

export const workspaceSessionToolNames = ["todoWrite"] as const;
