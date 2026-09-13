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
import { and, asc, eq, sql } from "drizzle-orm";

import { validationErrorResponse } from "@/api/errors";
import {
  forbiddenResponse as sharedForbiddenResponse,
  notFoundResponse,
  type JsonContext,
} from "@/api/response.schema";
import type { ApiAuthContext } from "@/api/auth/workos";
import { hasCapability } from "@/api/auth/policy";
import { db, schema, type DatabaseClient } from "@/lib/database/client";
import type { SpellcheckDictionary } from "@/lib/database/types";

export function invalidDictionaryPayloadResponse(c: { json: JsonContext["json"] }) {
  return validationErrorResponse(
    c,
    "invalid_dictionary_payload",
    "Invalid spellcheck dictionary payload",
  );
}

export function dictionaryNotFoundResponse(c: { json: JsonContext["json"] }) {
  return notFoundResponse(c, "dictionary_not_found", "Spellcheck dictionary not found");
}

export function forbiddenResponse(c: { json: JsonContext["json"] }) {
  return sharedForbiddenResponse(c, "forbidden", "Insufficient permissions");
}

export function isDictionaryMutationAllowed(role: ApiAuthContext["membership"]["role"]) {
  return hasCapability(role, "dictionaries:write");
}

export function toDictionaryRecord(
  dictionary: SpellcheckDictionary,
  extras?: { wordCount?: number },
) {
  return {
    id: dictionary.id,
    organizationId: dictionary.organizationId,
    createdByUserId: dictionary.createdByUserId,
    name: dictionary.name,
    description: dictionary.description,
    status: dictionary.status,
    wordsVersion: dictionary.wordsVersion,
    wordCount: extras?.wordCount ?? 0,
    createdAt: dictionary.createdAt.toISOString(),
    updatedAt: dictionary.updatedAt.toISOString(),
  };
}

export const projectSpellcheckDictionaryOrderBy = [
  asc(schema.projectSpellcheckDictionaries.priority),
  asc(schema.projectSpellcheckDictionaries.createdAt),
  asc(schema.projectSpellcheckDictionaries.dictionaryId),
];

export const dictionaryProjectAttachmentOrderBy = [
  asc(schema.projectSpellcheckDictionaries.priority),
  asc(schema.projectSpellcheckDictionaries.createdAt),
  asc(schema.projectSpellcheckDictionaries.projectId),
];

export async function nextProjectSpellcheckDictionaryPriority(projectId: string) {
  const [row] = await db
    .select({
      maxPriority: sql<number>`coalesce(max(${schema.projectSpellcheckDictionaries.priority}), -1)`,
    })
    .from(schema.projectSpellcheckDictionaries)
    .where(eq(schema.projectSpellcheckDictionaries.projectId, projectId));

  return Number(row?.maxPriority ?? -1) + 1;
}

export async function lockSpellcheckDictionaryWords(tx: DatabaseClient, dictionaryId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${[
      "spellcheck_dictionary_words",
      dictionaryId,
    ].join(":")}, 0))`,
  );
}

export async function resolveAttachmentPriority(
  projectId: string,
  requestedPriority: number | undefined,
) {
  if (requestedPriority !== undefined) {
    return requestedPriority;
  }
  return nextProjectSpellcheckDictionaryPriority(projectId);
}

export async function getOwnedDictionary(auth: ApiAuthContext, dictionaryId: string) {
  const [dictionary] = await db
    .select()
    .from(schema.spellcheckDictionaries)
    .where(
      and(
        eq(schema.spellcheckDictionaries.id, dictionaryId),
        eq(schema.spellcheckDictionaries.organizationId, auth.organization.localOrganizationId),
      ),
    )
    .limit(1);

  return dictionary ?? null;
}
