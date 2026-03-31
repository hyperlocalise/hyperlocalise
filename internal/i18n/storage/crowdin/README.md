# Crowdin storage adapter

Crowdin adapter for `hyperlocalise sync` operations.

## Config

```json
{
  "adapter": "crowdin",
  "config": {
    "projectID": "123456",
    "apiTokenEnv": "CROWDIN_API_TOKEN",
    "sourceLanguage": "en",
    "targetLanguages": ["fr", "de"]
  }
}
```

Set `CROWDIN_API_TOKEN` in your environment.
`projectID` must be the numeric Crowdin project ID.

## Crowdin Enterprise

Set `apiBaseURL` when your organization uses Crowdin Enterprise.

```json
{
  "adapter": "crowdin",
  "config": {
    "projectID": "123456",
    "apiTokenEnv": "CROWDIN_API_TOKEN",
    "apiBaseURL": "https://example.api.crowdin.com",
    "sourceLanguage": "en",
    "targetLanguages": ["fr", "de"]
  }
}
```

`apiBaseURL` must be an `https` URL and should point to your Enterprise API host.
