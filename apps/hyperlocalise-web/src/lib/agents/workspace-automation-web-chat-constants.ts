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

export const WEB_CHAT_VISITOR_COOKIE_NAME = "hl_web_chat_visitor";
export const WEB_CHAT_HISTORY_LIMIT = 40;
export const WEB_CHAT_MAX_IMAGE_FILES = 4;
export const WEB_CHAT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Multipart framing + text-field headroom beyond the per-file byte cap. */
export const WEB_CHAT_IMAGE_UPLOAD_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
/** Request body limit must cover every attached image plus multipart framing. */
export const WEB_CHAT_MAX_IMAGE_REQUEST_BYTES =
  WEB_CHAT_MAX_IMAGE_FILES * WEB_CHAT_MAX_IMAGE_BYTES +
  WEB_CHAT_IMAGE_UPLOAD_MULTIPART_OVERHEAD_BYTES;
export const WEB_CHAT_IMAGE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export function buildWebChatSourceThreadId(input: { automationId: string; visitorId: string }) {
  return `web-chat:${input.automationId}:${input.visitorId}`;
}

export function isWebChatImageContentType(contentType: string) {
  return WEB_CHAT_IMAGE_CONTENT_TYPES.has(contentType.toLowerCase());
}
