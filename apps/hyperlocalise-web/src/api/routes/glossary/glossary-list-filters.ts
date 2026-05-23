import { and, eq, ilike, isNotNull, or, type SQL } from "drizzle-orm";

import { schema } from "@/lib/database";

import type { ListGlossaryQuery } from "./glossary.schema";

export function buildGlossaryListWhere(
  organizationId: string,
  query?: ListGlossaryQuery,
): SQL | undefined {
  const conditions: SQL[] = [eq(schema.glossaries.organizationId, organizationId)];

  const search = query?.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(schema.glossaries.name, pattern),
        ilike(schema.glossaries.externalProjectId, pattern),
        ilike(schema.glossaries.externalGlossaryId, pattern),
      )!,
    );
  }

  if (query?.source) {
    conditions.push(eq(schema.glossaries.source, query.source));
  }

  if (query?.provider) {
    conditions.push(eq(schema.glossaries.externalProviderKind, query.provider));
  }

  if (query?.resourceType) {
    conditions.push(eq(schema.glossaries.externalResourceType, query.resourceType));
  }

  if (query?.sync) {
    if (query.sync === "error") {
      conditions.push(isNotNull(schema.glossaries.lastSyncErrorAt));
    } else {
      conditions.push(eq(schema.glossaries.syncState, query.sync));
    }
  }

  return and(...conditions);
}
