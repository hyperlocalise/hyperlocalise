# Lilt storage adapter

The Lilt adapter integrates Hyperlocalise with Lilt's file workflows.

## Configuration

```json
{
  "projectID": "123",
  "apiTokenEnv": "LILT_API_TOKEN",
  "targetLanguages": ["fr", "de"],
  "timeoutSeconds": 30,
  "pollIntervalMs": 1000,
  "maxPolls": 60
}
```

`apiToken` is intentionally not supported inline; set `LILT_API_TOKEN` (or `apiTokenEnv`).

## Pull behavior

For each locale:

1. Trigger export job.
2. Poll export status until completion.
3. Download produced artifact (JSON or ZIP of JSON files).
4. Parse into normalized `storage.Entry` records.

The adapter trims and skips empty key/locale/value rows and de-duplicates by `EntryID` with latest entry winning.

## Push behavior

1. Build locale upload payloads from `PushRequest.Entries`.
2. Upload/import files per locale.
3. Return applied/skipped `EntryID`s and revision/job metadata when available.

Conflict resolution remains in `syncsvc`; this adapter only transports data.
