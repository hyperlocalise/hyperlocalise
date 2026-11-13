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
import type { WebflowCollection, WebflowCollectionFieldType } from "./types";

const TRANSLATABLE_FIELD_TYPES = new Set<WebflowCollectionFieldType>([
  "PlainText",
  "RichText",
  "Option",
]);

export function listTranslatableWebflowFields(collection: WebflowCollection): Array<{
  id: string;
  slug: string;
  type: WebflowCollectionFieldType;
}> {
  return collection.fields.filter((field) => TRANSLATABLE_FIELD_TYPES.has(field.type));
}

export function extractWebflowFieldStrings(input: {
  fields: Array<{ slug: string }>;
  fieldData: Record<string, unknown>;
}): Record<string, string> {
  const map: Record<string, string> = {};
  for (const field of input.fields) {
    const value = input.fieldData[field.slug];
    if (typeof value === "string" && value.trim().length > 0) {
      map[field.slug] = value;
    }
  }
  return map;
}
