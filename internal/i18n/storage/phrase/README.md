# Phrase storage adapter

Phrase adapter for `hyperlocalise sync` operations.

## Config

```json
{
  "adapter": "phrase",
  "config": {
    "projectID": "project-uuid",
    "apiTokenEnv": "PHRASE_API_TOKEN",
    "mode": "strings",
    "sourceLanguage": "en",
    "targetLanguages": ["fr", "de"],
    "fileFormat": "json"
  }
}
```

Set `PHRASE_API_TOKEN` in your environment.

## Modes

- `mode: "strings"` uses Phrase string APIs for key/translation upserts.
- `mode: "files"` uses Phrase export/import jobs and file payloads.
