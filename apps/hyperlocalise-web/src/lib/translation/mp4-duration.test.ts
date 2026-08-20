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
import { describe, expect, it } from "vite-plus/test";

import { isErr, isOk } from "@/lib/primitives/result/results";

import { assertMp4DurationSupported, readMp4DurationSeconds } from "./mp4-duration";

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

/** Minimal `ftyp` + `moov/mvhd` (version 0) fixture. */
function buildMp4WithDuration(durationSeconds: number, timescale = 1000) {
  const bytes = new Uint8Array(52);
  writeUint32(bytes, 0, 16);
  writeAscii(bytes, 4, "ftyp");
  writeAscii(bytes, 8, "isom");
  writeUint32(bytes, 16, 36);
  writeAscii(bytes, 20, "moov");
  writeUint32(bytes, 24, 28);
  writeAscii(bytes, 28, "mvhd");
  writeUint32(bytes, 44, timescale);
  writeUint32(bytes, 48, Math.round(durationSeconds * timescale));
  return bytes;
}

describe("mp4 duration probe", () => {
  it("reads duration from a version-0 mvhd box", () => {
    expect(readMp4DurationSeconds(buildMp4WithDuration(5))).toBe(5);
    expect(readMp4DurationSeconds(buildMp4WithDuration(2))).toBe(2);
    expect(readMp4DurationSeconds(buildMp4WithDuration(11))).toBe(11);
  });

  it("returns null when no mvhd box is present", () => {
    const bytes = new Uint8Array(16);
    writeUint32(bytes, 0, 16);
    writeAscii(bytes, 4, "ftyp");
    writeAscii(bytes, 8, "isom");
    expect(readMp4DurationSeconds(bytes)).toBeNull();
  });

  it("accepts clips between 3 and 30 seconds", () => {
    const shortResult = assertMp4DurationSupported(buildMp4WithDuration(5));
    expect(isOk(shortResult)).toBe(true);
    if (isErr(shortResult)) {
      throw new Error("expected 5s clip to be supported");
    }
    expect(shortResult.value.durationSeconds).toBe(5);

    const longResult = assertMp4DurationSupported(buildMp4WithDuration(30));
    expect(isOk(longResult)).toBe(true);
    if (isErr(longResult)) {
      throw new Error("expected 30s clip to be supported");
    }
    expect(longResult.value.durationSeconds).toBe(30);
  });

  it("rejects clips shorter than 3 seconds", () => {
    const result = assertMp4DurationSupported(buildMp4WithDuration(2));
    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected 2s clip to be rejected");
    }
    expect(result.error).toEqual({ code: "video_duration_unsupported", durationSeconds: 2 });
  });

  it("rejects clips longer than 30 seconds", () => {
    const result = assertMp4DurationSupported(buildMp4WithDuration(31));
    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected 31s clip to be rejected");
    }
    expect(result.error).toEqual({ code: "video_duration_unsupported", durationSeconds: 31 });
  });

  it("rejects unreadable mp4 buffers", () => {
    const result = assertMp4DurationSupported(Buffer.from("not-an-mp4"));
    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected unreadable buffer to fail");
    }
    expect(result.error).toEqual({ code: "video_duration_unreadable" });
  });
});
