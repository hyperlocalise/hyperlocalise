# Glossary interchange profile

Hyperlocalise exports TBX 3 using the ISO 30042 namespace, `TBX-Basic`, and
DCA style. Concepts are `conceptEntry` elements, locales are `langSec`
elements, and every term is a separate `termSec` under its concept and locale.

The interchange model is shared by the TBX and XLSX codecs. XLSX uses a
`Concepts` sheet and a `Terms` sheet: one row represents one concept or term,
so synonyms never overwrite one another. JSON columns retain language-specific
details and namespaced custom metadata.

Supported mappings include subject, definitions, notes, URLs, part of speech,
gender, term type, status, lemma, case sensitivity, forbidden status,
provenance, review status, timestamps, and stable IDs. TBX DCA values are
mapped explicitly. Values without a valid DCA value are retained as labeled
Hyperlocalise notes and reported as warnings; invalid XML characters, invalid
URLs, duplicate IDs, incomplete concepts, and limit violations are errors.

Imports support preview, create, update, merge, and replace modes. Native
imports are processed in bounded batches. Replace and update-capable imports
create an XLSX backup before applying changes, and every import has a durable
report containing source totals, entity counts, and row/concept diagnostics.

The TBX parser is bounded and event-driven. The pinned RELAX NG and DCA
Schematron resources used by the test suite are in `tbx-validation/`.
