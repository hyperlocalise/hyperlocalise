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
const THIN_PAGE_TEXT_LIMIT = 3000;

// Interstitial widgets only. Cloudflare also injects
// /cdn-cgi/challenge-platform/scripts/jsd/main.js on ordinary pages (Discord,
// Medium, Indeed, and others), so a bare "challenge-platform" or "cf-chl-"
// match is not a block.
const VENDOR_CHALLENGE_MARKERS = [
  /window\._cf_chl_opt|cf-chl-(?:widget|bypass)|challenges\.cloudflare\.com\/cdn-cgi\/challenge-platform\/h\//i,
  /captcha-delivery\.com/i,
  /id=["']px-captcha/i,
  /_Incapsula_Resource/i,
];

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
  /just\s+a\s+moment/i,
];

function visiblePageText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

export function detectLocalisationAuditCrawlBlock(
  status: number,
  html: string,
): LocalisationAuditCrawlBlockReason | null {
  if (ACCESS_DENIED_STATUS_CODES.has(status)) {
    return "bot_protection";
  }

  const text = visiblePageText(html);
  if (text.length >= THIN_PAGE_TEXT_LIMIT) {
    return null;
  }

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  if (VENDOR_CHALLENGE_MARKERS.some((marker) => marker.test(html))) {
    return "bot_protection";
  }

  if (BOT_CHALLENGE_MARKERS.some((marker) => marker.test(`${text} ${title}`))) {
    return "bot_protection";
  }

  return null;
}
