# Cache resolved dictionary words in Valkey

Cache the merged word set returned by the project dictionaries `resolved` endpoint. Keep organization membership and project access checks live, and reload active dictionary metadata on every request. Preserve the existing response shape, including `wordsVersion`.

Use a versioned cache key containing a hash of the organization, project, normalized locale, and ordered dictionary IDs, word versions, and priorities. The metadata query orders attachments by priority, creation time, and dictionary ID. Changes to membership in the active set or precedence select a new key. Existing transactional word-version increments cover word creation, deletion, and import. Expire entries after ten minutes.

On a miss, reload metadata and words in a read-only repeatable-read transaction. Populate the key derived from that snapshot only after the transaction commits. This prevents concurrent mutations from pairing a word set with unrelated versions. Cache only bounded JSON word arrays. Limit each Valkey operation to 100 milliseconds and fall back to the database on missing, malformed, or unavailable cache entries. Cache writes never determine request success.

Alternatives considered: whole-response TTL caching would delay access and edit visibility; explicit deletion on every mutation adds attachment fan-out and races with concurrent cache fills. Database-derived version keys avoid both problems without a schema change.

Verify cache hits skip word queries while preserving authorization and metadata reads; version, attachment order, locale, and tenant changes select distinct keys; failed or malformed cache reads fall back; transaction failures never populate the cache; concurrent metadata changes use the snapshot's key. Keep unconfigured Valkey behavior unchanged. Run formatting, lint, all Go tests, and focused race tests.
