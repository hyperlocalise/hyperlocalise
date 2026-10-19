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

/** JSON-like values stored in Sanity documents and internationalized-array slots. */
export type SanityFieldValue =
  | string
  | number
  | boolean
  | null
  | SanityFieldValue[]
  | SanityFieldObject;

export type SanityFieldObject = { [key: string]: SanityFieldValue };

/** Content Lake document body (excluding strict system-field typing). */
export type SanityDocumentRecord = SanityFieldObject;

export type SanityStoredDocument = SanityDocumentRecord & {
  _id: string;
  _type: string;
  _updatedAt?: string;
};

/** JSON blobs persisted on sync runs (errors, input snapshots). */
export type SanityJsonObject = SanityFieldObject;

export type PortableTextSpan = SanityFieldObject & { text?: string };

export type PortableTextBlock = SanityFieldObject & {
  _type?: string;
  children?: PortableTextSpan[];
};

export function isSanityFieldObject(value: SanityFieldValue): value is SanityFieldObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isSanityReference(value: SanityFieldValue): boolean {
  return isSanityFieldObject(value) && typeof value._ref === "string";
}

export function isPortableTextBlock(value: SanityFieldValue): value is PortableTextBlock {
  if (!isSanityFieldObject(value)) {
    return false;
  }
  return value._type === "block" && Array.isArray(value.children);
}
