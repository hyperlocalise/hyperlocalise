/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { customType } from "drizzle-orm/pg-core";

export const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

export const bigintText = customType<{ data: string; driverData: string | number }>({
  dataType() {
    return "bigint";
  },
  fromDriver(value) {
    return String(value);
  },
  toDriver(value) {
    return value;
  },
});

// Lexical full-text search is a good default for glossary and TM lookup.
// It will miss semantically similar phrasing with low token overlap; if that becomes a real issue,
// the next step is adding embedding-backed retrieval alongside these search vectors rather than replacing them.
//
// Example future pgvector shape:
//   1. Enable the extension in a migration:
//      CREATE EXTENSION IF NOT EXISTS vector;
//   2. Add an embedding column such as:
//      embedding vector(1536)
//   3. Add an ANN index such as:
//      CREATE INDEX ... USING hnsw (embedding vector_cosine_ops);
//   4. Query with hybrid ranking, for example lexical filtering plus cosine-distance ordering.
