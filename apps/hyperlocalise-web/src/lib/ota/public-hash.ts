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
import { randomBytes } from "node:crypto";

/** 16 bytes → 128 bits. Enough that the public hash cannot be enumerated. */
export const OTA_PUBLIC_HASH_BYTE_LENGTH = 16;

export const OTA_PUBLIC_HASH_PATTERN = /^[0-9a-f]{32}$/;

/**
 * Returns a unique, unguessable public distribution hash.
 * The value is random. It is not derived from a project id, name, or other input.
 */
export function generateOtaPublicHash(): string {
  return randomBytes(OTA_PUBLIC_HASH_BYTE_LENGTH).toString("hex");
}

export function isOtaPublicHash(value: string): boolean {
  return OTA_PUBLIC_HASH_PATTERN.test(value);
}
