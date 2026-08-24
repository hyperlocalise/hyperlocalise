# Native CAT exact-source group resolution

## Context

Native CAT queue pages cannot determine duplicate membership because matching source keys may live on another page or in another repository file. The backend must derive groups from the native project scope while keeping translation keys and translations as the persistence boundary.

## Design

Each imported native translation key stores a SHA-256 hash of its exact UTF-8 source text. Source synchronization recomputes the hash whenever it upserts a key. A composite project-and-hash index supports candidate grouping and member lookup without indexing arbitrarily long source text.

The hash accelerates database access; it does not define equality. Group queries also compare the raw `sourceText`, so normalization and hash collisions cannot merge different sources. A group ID is derived from the project ID, target locale, source hash, and exact source text. No synthetic key, group, or membership record is stored.

When `automaticallyGroupIdenticalStrings` is disabled, native CAT keeps its existing segment query. When enabled, PostgreSQL resolves logical rows before queue filtering, ordering, counting, and pagination. A logical row is either an individual segment or a group summary. Group summaries report occurrence counts for the selected file and the project. The resolver accepts an exception predicate seam for HL-622.

The queue does not include complete group membership. A native group-occurrences endpoint resolves the group again by project, locale, hash, and exact source text, then returns the current translation keys with their file, context, comments, lock, target, and review state. Imports and synchronization therefore cannot leave stale members in a group.

## Performance

Import computes one SHA-256 digest per source key. Queue and occurrence queries use the composite project-and-hash index and keep grouping, filtering, ordering, counting, and pagination in PostgreSQL. The application receives only the requested logical summaries or one opened group's members.

## Tests

Focused tests cover exact versus normalized source equality, cross-file membership, deterministic IDs, setting-disabled behavior, logical filters and ordering, logical-row and occurrence totals, pagination across groups, lazy occurrence loading, exception subtraction, and source changes after synchronization.
