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
import type { LocalisationAuditCrawlBlockReason } from "./types";

const ACCESS_DENIED_STATUS_CODES = new Set([401, 403, 429]);
const BOT_CHALLENGE_MARKERS = [
  /access\s+denied/i,
  /request\s+blocked/i,
  /bot\s+(?:detected|traffic)/i,
  /(?:verify|confirm)\s+you(?:'re| are)\s+(?:a\s+)?human/i,
  /checking\s+your\s+browser/i,
  /enable\s+(?:javascript|js)\s+and\s+cookies/i,
  /unusual\s+traffic/i,
  /security\s+(?:check|challenge)\s+(?:required|in\s+progress|to\s+continue)/i,
  /(?:solve|complete|verify).{0,40}captcha/i,
  /captcha.{0,40}(?:challenge|verify|human)/i,
  /(?:challenge-platform|cf-chl-)/i,
  /just\s+a\s+moment/i,
];

export function detectLocalisationAuditCrawlBlock(
  status: number,
  html: string,
): LocalisationAuditCrawlBlockReason | null {
  if (ACCESS_DENIED_STATUS_CODES.has(status)) {
    return "bot_protection";
  }

  if (BOT_CHALLENGE_MARKERS.some((marker) => marker.test(html))) {
    return "bot_protection";
  }

  return null;
}
