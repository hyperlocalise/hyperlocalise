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

import { generateOtaPublicHash, isOtaPublicHash, OTA_PUBLIC_HASH_BYTE_LENGTH } from "./public-hash";

describe("generateOtaPublicHash", () => {
  it("returns 32 lowercase hex characters from 16 random bytes", () => {
    const hash = generateOtaPublicHash();
    expect(hash).toHaveLength(OTA_PUBLIC_HASH_BYTE_LENGTH * 2);
    expect(isOtaPublicHash(hash)).toBe(true);
  });

  it("does not derive the hash from caller-supplied project identity", () => {
    const first = generateOtaPublicHash();
    const second = generateOtaPublicHash();
    expect(first).not.toBe(second);
    expect(first.includes("project_")).toBe(false);
    expect(second.toLowerCase()).toBe(second);
  });
});

describe("isOtaPublicHash", () => {
  it("rejects hashes that are too short or mixed-case", () => {
    expect(isOtaPublicHash("abc")).toBe(false);
    expect(isOtaPublicHash("A".repeat(32))).toBe(false);
    expect(isOtaPublicHash(`${"a".repeat(31)}g`)).toBe(false);
  });
});
