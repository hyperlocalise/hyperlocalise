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
import githubDark from "@pierre/highlights/themes/github-dark";
import githubLight from "@pierre/highlights/themes/github-light";
import { createHighlightsPlugin } from "@pierre/words/highlights";
import { createMermaidPlugin } from "@pierre/words/mermaid";
import type { PluginConfig } from "@pierre/words/react";
import { render } from "pele";

/**
 * Code highlighting and Mermaid diagrams for AI message rendering.
 *
 * Code colors follow the page's `color-scheme` through CSS `light-dark()`.
 */
export const markdownPlugins: PluginConfig = {
  code: createHighlightsPlugin({
    themes: { light: githubLight, dark: githubDark },
    defaultColor: "light-dark()",
  }),
  mermaid: createMermaidPlugin({ render }, { responsive: true }),
};
