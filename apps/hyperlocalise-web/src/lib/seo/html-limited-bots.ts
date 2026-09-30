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
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";

/**
 * Crawlers that must receive metadata (hreflang, canonical) in `<head>` of the raw HTML.
 * Next's default list omits the main `Googlebot` UA and SEO/AI crawlers, which then see
 * streamed metadata appended to `<body>`, where hreflang is ignored.
 */
const ADDITIONAL_HTML_LIMITED_BOTS = [
  "Googlebot",
  "AhrefsBot",
  "SemrushBot",
  "Screaming Frog",
  "Sitebulb",
  "rogerbot",
  "DotBot",
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "ClaudeBot",
  "Claude-SearchBot",
];

export const HTML_LIMITED_BOTS = new RegExp(
  `${HTML_LIMITED_BOT_UA_RE.source}|${ADDITIONAL_HTML_LIMITED_BOTS.join("|")}`,
  "i",
);
