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
import { err, ok, type Result } from "@/lib/primitives/result/results";

export const VIDEO_LOCALIZATION_MIN_DURATION_SECONDS = 3;
export const VIDEO_LOCALIZATION_MAX_DURATION_SECONDS = 30;

export type Mp4DurationError =
  | { code: "video_duration_unreadable" }
  | { code: "video_duration_unsupported"; durationSeconds: number };

export type Mp4Duration = {
  durationSeconds: number;
};

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function readUint64(bytes: Uint8Array, offset: number) {
  const high = readUint32(bytes, offset);
  const low = readUint32(bytes, offset + 4);
  return high * 2 ** 32 + low;
}

function walkBoxes(
  bytes: Uint8Array,
  start: number,
  end: number,
  visit: (type: string, payloadStart: number, payloadEnd: number) => boolean,
): boolean {
  let offset = start;
  while (offset + 8 <= end) {
    let size = readUint32(bytes, offset);
    const type = readAscii(bytes, offset + 4, 4);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > end) {
        return false;
      }
      size = readUint64(bytes, offset + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }

    if (!Number.isFinite(size) || size < headerSize || offset + size > end) {
      return false;
    }

    if (visit(type, offset + headerSize, offset + size)) {
      return true;
    }
    offset += size;
  }
  return false;
}

function readMvhdDurationSeconds(bytes: Uint8Array, payloadStart: number, payloadEnd: number) {
  if (payloadEnd - payloadStart < 20) {
    return null;
  }

  const version = bytes[payloadStart] ?? 0;
  if (version === 1) {
    if (payloadEnd - payloadStart < 32) {
      return null;
    }
    const timescale = readUint32(bytes, payloadStart + 20);
    const duration = readUint64(bytes, payloadStart + 24);
    if (timescale <= 0) {
      return null;
    }
    return duration / timescale;
  }

  const timescale = readUint32(bytes, payloadStart + 12);
  const duration = readUint32(bytes, payloadStart + 16);
  if (timescale <= 0) {
    return null;
  }
  return duration / timescale;
}

/** Reads movie duration from an MP4 `mvhd` box. Scans the full buffer so `moov` may trail `mdat`. */
export function readMp4DurationSeconds(bytes: Uint8Array | Buffer): number | null {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let durationSeconds: number | null = null;

  walkBoxes(view, 0, view.byteLength, (type, payloadStart, payloadEnd) => {
    if (type !== "moov") {
      return false;
    }

    walkBoxes(view, payloadStart, payloadEnd, (childType, childStart, childEnd) => {
      if (childType !== "mvhd") {
        return false;
      }
      durationSeconds = readMvhdDurationSeconds(view, childStart, childEnd);
      return true;
    });

    return durationSeconds != null;
  });

  return durationSeconds;
}

export function assertMp4DurationSupported(
  bytes: Uint8Array | Buffer,
): Result<Mp4Duration, Mp4DurationError> {
  const durationSeconds = readMp4DurationSeconds(bytes);
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return err({ code: "video_duration_unreadable" });
  }

  if (
    durationSeconds < VIDEO_LOCALIZATION_MIN_DURATION_SECONDS ||
    durationSeconds > VIDEO_LOCALIZATION_MAX_DURATION_SECONDS
  ) {
    return err({ code: "video_duration_unsupported", durationSeconds });
  }

  return ok({ durationSeconds });
}
