# Translation memory upload options

## Decision

Give workspace translation memories a first-class TMX/CSV upload path at creation time, and surface the same import action on empty memories.

Users who can create memories can attach a TMX or CSV file in the create dialog. After the memory is created, the existing import API writes the file. Users who can edit a memory also see Import on the detail toolbar and in the empty-entry state. The three-dot menu keeps its existing Import and Export items.

## Rationale

Import already existed on the memory detail page, but it was easy to miss: create-memory left the file step for later, and empty memories only showed a sentence. Glossary already puts import next to the empty state. TMX remains the interchange format; CSV stays available for spreadsheet edits.

## Constraints

- Reuse the existing `/entries/import` route, dry-run preview, and size/unit limits.
- Reject files that are not `.tmx` or `.csv`.
- If import fails after create, keep the new memory and send the user to its detail page.
- Do not add upload for live provider memories.
