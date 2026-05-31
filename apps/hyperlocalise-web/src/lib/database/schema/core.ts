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
