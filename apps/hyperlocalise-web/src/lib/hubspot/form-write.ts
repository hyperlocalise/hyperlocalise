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

function dateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

/**
 * HubSpot's form create and replace schemas require `createdAt`.
 * The SDK omits the field when it is missing, and HubSpot then rejects the body.
 * Replace also rejects a body `id` that differs from the form id in the path.
 */
export function formDefinitionForWrite(
  definition: Record<string, unknown>,
  input: { name: string; language: string; id?: string },
): Record<string, unknown> {
  const next = structuredClone(definition);
  next.name = input.name;
  const configuration = next.configuration;
  if (configuration && typeof configuration === "object" && !Array.isArray(configuration)) {
    (configuration as { language?: string }).language = input.language;
  }
  const now = new Date();
  next.createdAt = dateValue(next.createdAt) ?? now;
  next.updatedAt = dateValue(next.updatedAt) ?? now;
  if (typeof next.archived !== "boolean") {
    next.archived = false;
  }
  if (input.id) {
    next.id = input.id;
  } else {
    delete next.id;
    delete next.archivedAt;
  }
  return next;
}
