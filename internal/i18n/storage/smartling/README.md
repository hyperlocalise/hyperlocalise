# Smartling Storage Adapter

This package implements a `StorageAdapter` for `hyperlocalise` using Smartling APIs.

## Config

### Strings mode (default, backward compatible)

```jsonc
{
  "storage": {
    "adapter": "smartling",
    "config": {
      "projectID": "your-project-id",
      "userIdentifier": "your-user-identifier",
      "userSecretEnv": "SMARTLING_USER_SECRET",
      "mode": "strings",
      "targetLanguages": ["fr", "de"],
      "timeoutSeconds": 30
    }
  }
}
```

### Files mode

```jsonc
{
  "storage": {
    "adapter": "smartling",
    "config": {
      "projectID": "your-project-id",
      "userIdentifier": "your-user-identifier",
      "userSecretEnv": "SMARTLING_USER_SECRET",
      "mode": "files",
      "targetLanguages": ["fr", "de"],
      "timeoutSeconds": 30
    }
  }
}
```

## Auth and env var requirements

Both modes require:

- `projectID`
- `userIdentifier`
- `SMARTLING_USER_SECRET` (or override with `userSecretEnv`)

Notes by mode:

- `strings` mode uses Smartling strings endpoints.
- `files` mode uses Smartling file import/export endpoints plus async job polling.

## Known limitations

- **Formats**: file mode currently normalizes file payloads as flat JSON (`key -> translated value`). Nested file structures are not preserved.
- **Context behavior**:
  - strings mode keeps Smartling instruction/file URI as context when available.
  - files mode does not round-trip Smartling-native context fields; context is only used locally for dedupe identity.
- **Namespace handling**: Smartling adapter still reports `SupportsNamespaces=false`; namespaces are not mapped in either mode.
