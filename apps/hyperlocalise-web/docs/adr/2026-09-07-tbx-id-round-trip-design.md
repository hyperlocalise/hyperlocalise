# Preserve TBX IDs Across Round Trips

## Problem

TBX requires XML-compatible `id` attributes. Two distinct application IDs can normalize to the
same XML ID, so the exporter disambiguates collisions. The XML IDs do not encode the original IDs,
which causes a later import to match or create the wrong glossary records.

## Design

Keep the XML-compatible IDs for TBX validation and external tool compatibility. Store each original
concept and term ID in the existing Hyperlocalise labeled-note channel. During parsing, restore the
original ID from that metadata and use the XML attribute as a fallback for third-party TBX files.

This approach preserves current XML IDs, supports arbitrary application IDs, and reuses metadata
escaping already implemented for user notes. Tests must assert exact concept and term IDs after an
export and import, including IDs that collide after XML normalization.

## Validation

Run the TBX unit tests, the full test suite, and `vp check --fix`.
