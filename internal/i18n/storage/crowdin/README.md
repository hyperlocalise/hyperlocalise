# Crowdin storage adapter

Crowdin adapter for `hyperlocalise sync` operations.

## Config

```json
{
  "adapter": "crowdin",
  "config": {
    "projectID": "your-project-id",
    "apiTokenEnv": "CROWDIN_API_TOKEN",
    "sourceLanguage": "en",
    "targetLanguages": ["fr", "de"]
  }
}
```

Set `CROWDIN_API_TOKEN` in your environment.
