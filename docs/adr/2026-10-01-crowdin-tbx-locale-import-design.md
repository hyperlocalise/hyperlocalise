# Crowdin TBX locale import mapping

## Problem

Crowdin TBX exports use short language IDs such as `de`, while native glossaries commonly configure region-qualified locales such as `de-DE`. The import validator treats those values as different locales and reports that the locale is not configured.

## Design

Resolve each imported locale against the glossary's configured locales before validation. Explicit `localeMapping` entries take precedence. For the native asynchronous import path, the Lambda resolver uses Crowdin's known default regions when that configured locale exists. For the legacy inline Go path, a short ID maps only when exactly one configured locale shares its base language. Apply either translation only when it matches a configured glossary locale; otherwise preserve the existing validation behavior.

The resolver will keep the configured locale's spelling and region, so imported terms are stored under `de-DE` rather than the raw `de` value. It will emit a warning diagnostic when it performs this provider-specific mapping.

## Testing

Add a route regression test that imports Crowdin-style TBX language IDs into a glossary configured with region-qualified locales. Verify that terms import successfully, mapped locales are stored with their configured values, and no `unknown_locale` diagnostic is produced. Existing tests continue to cover unsupported locales and explicit mappings.
