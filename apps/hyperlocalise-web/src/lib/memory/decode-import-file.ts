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
import { TMX_MAX_IMPORT_CONTENT_CHARS } from "./tmx/tmx-constants";

function looksLikeUtf16Le(bytes: Uint8Array) {
  return (
    bytes.length >= 10 &&
    bytes[0] === 0x3c &&
    bytes[1] === 0x00 &&
    bytes[2] === 0x3f &&
    bytes[3] === 0x00
  );
}

function looksLikeUtf16Be(bytes: Uint8Array) {
  return (
    bytes.length >= 10 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x3c &&
    bytes[2] === 0x00 &&
    bytes[3] === 0x3f
  );
}

export function decodeMemoryImportBytes(bytes: Uint8Array) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  if (looksLikeUtf16Le(bytes)) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (looksLikeUtf16Be(bytes)) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export async function readMemoryImportFile(file: File) {
  if (file.size > TMX_MAX_IMPORT_CONTENT_CHARS) {
    return { ok: false as const, code: "oversized" as const };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > TMX_MAX_IMPORT_CONTENT_CHARS) {
    return { ok: false as const, code: "oversized" as const };
  }
  return { ok: true as const, content: decodeMemoryImportBytes(bytes) };
}
