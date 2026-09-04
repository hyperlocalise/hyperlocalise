 # Crowdin OTA concordance coverage design

 ## Objective

 Expand the OTA glossary fixture so its Crowdin recording exercises the important
 concordance behaviors of the native glossary: context matching, term boundaries,
 statuses, case sensitivity, overlapping concepts, missing or inactive records,
 empty inputs, and result limits.

 ## Design

 Keep the existing 50 concepts and their IDs as the baseline. Add a small set of
 deliberately named concepts and terms for edge cases instead of replacing the
 realistic OTA vocabulary. Extend the fixture schema with term-level
 `caseSensitive` and `reviewStatus`, and concept-level `translatable`, so the same
 source data can drive TBX generation, Crowdin capture, and local Postgres seeding.

 Add query groups with explicit intent. Queries should include complete sentences,
 standalone terms, hyphenated terms, boundary negatives, preferred/admitted/
 forbidden terms, case variants, target-language and unknown text, status-filter
 controls, empty or punctuation-only text, and batches larger than the default
 result limit. Keep expressions deterministic and cap individual Crowdin requests
 at the API-supported batch size.

 ## Data flow

 The Go fixture tool validates the expanded JSON, writes TBX, optionally imports the
 glossary into Crowdin, and records the Crowdin concordance responses. The DB-backed
 web test reads the same fixture, imports it into a temporary native glossary, and
 replays every recorded expression as an independent test case. Comparison removes
 provider-specific IDs and sorts matches, while preserving term status and locale
 semantics.

 ## Compatibility and failure handling

 Existing concept IDs, query IDs, and baseline expressions remain stable where
 possible. Fixture validation rejects duplicate IDs, invalid statuses, unsupported
 locales, malformed edge-case metadata, and invalid query sizes. Recording remains
 credential-free after capture; tests never call Crowdin. A provider mismatch is
 reported per expression so all failures are visible in one run.

 ## Verification

 Run the fixture tool's Go tests, regenerate the TBX and Crowdin recording with
 credentials, then run the focused native concordance unit tests and the DB-backed
 recording integration test. Do not run the repository-wide `make lint` or `make
 test` commands for this task.
