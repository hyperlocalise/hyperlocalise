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
export type MarkdownSelectionAiRequest = {
  selectedText: string;
  instruction: string;
  documentContext: string;
};

export type MarkdownSelectionAiResult = {
  suggestion: string;
  reasoning: string;
};

export type MarkdownSelectionAiConfig = {
  sourceLocale: string;
  targetLocale: string;
  request: (input: MarkdownSelectionAiRequest) => Promise<MarkdownSelectionAiResult>;
};
