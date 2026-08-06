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
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { PluginConfig } from "streamdown";

/**
 * Official Streamdown plugins used by AI message rendering.
 *
 * Cast through PluginConfig because @streamdown/code's Shiki TokensResult
 * type can diverge from streamdown's structural HighlightResult after Shiki
 * bumps, even though the runtime plugins remain compatible.
 */
export const streamdownPlugins = {
  cjk,
  code,
  math,
  mermaid,
} as PluginConfig;
