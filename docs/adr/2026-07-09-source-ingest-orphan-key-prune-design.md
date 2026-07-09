# ADR: Prune removed source keys on ingest

## Status

Accepted

## Date

2026-07-09

## Context

Source-file ingest upserts keys present in the uploaded file but never removes
keys that disappeared. Orphan keys stay in CAT, export, and pull after a
re-push that deletes strings from the source file.

Translations and comments already cascade-delete when a key is removed.
Issue-sheet rows null out `translationKeyId`.

## Decision

Hard-delete orphan keys during successful source-key sync.

On `upsertKeysFromEntries` for a repository source file:

1. Upsert keys from the extracted entry set.
2. Delete keys for that file whose `key` is not in the set.
3. An empty successful parse deletes all keys for that file.
4. Skip prune when the entry list is truncated at the import cap (5,000), so
   keys beyond the cap are not wiped by accident.

Same-hash re-pushes that skip ingest do not prune.

## Consequences

- Removed source strings disappear from CAT and downloads after the next
  successful ingest.
- Approved translations for deleted keys are removed with the key.
- Renamed keys do not keep prior translations on the old key; TM may still
  match by normalized source text when the new key is translated.
