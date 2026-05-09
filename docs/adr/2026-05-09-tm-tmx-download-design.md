# Translation memory TMX download design

## Context

The Phrase and Crowdin CLI translation memory download commands already export CSV. Users also need TMX so they can move translation memory data between tools that accept the standard TMX exchange format.

## Decision

Add a `--format` flag to both `phrase tm download` and `crowdin tm download`. The flag accepts `csv` and `tmx`. CSV remains the default to keep existing scripts working.

Phrase already exports TMX from its TMS API. The CLI should stream that native TMX payload when users pass `--format tmx`. CSV output should keep using the existing TMX parser and CSV writer.

Crowdin exposes translation memory segments through records. The CLI should generate a deterministic TMX document from those records when users pass `--format tmx`. Each TMX translation unit should contain the selected source record and requested target records for one segment.

## Error handling

The commands should reject unsupported formats before loading credentials or calling remote APIs. File output should keep the existing temporary-file behavior so failed downloads do not replace existing files.

## Testing

Cover CLI routing for CSV and TMX formats. Cover Phrase native TMX streaming and Crowdin generated TMX output in storage tests.
