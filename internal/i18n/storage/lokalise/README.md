# Lokalise Storage Adapter

This package implements a `StorageAdapter` for `hyperlocalise`, backed by Lokalise API v2.

## Config

```jsonc
{
  "storage": {
    "adapter": "lokalise",
    "config": {
      "projectID": "your-project-id",
      "apiToken": "lok_xxx",
      "apiTokenEnv": "LOKALISE_API_TOKEN",
      "targetLanguages": ["fr", "de"],
      "timeoutSeconds": 30
    }
  }
}
```

Token can come from `apiToken` or `LOKALISE_API_TOKEN`.
