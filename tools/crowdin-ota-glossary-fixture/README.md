# Crowdin OTA glossary fixture

This tool generates a 52-concept online-travel-agent glossary for English,
Vietnamese, Japanese, German, and Korean. It can import the generated TBX into
Crowdin and record organization glossary concordance responses for ten query
cases per target language. The fixture includes contextual sentences, boundary
negatives, overlaps, locale negative cases, and a dedicated trailing-s variant
matrix.

The source fixture is shared with the web-app tests at
`apps/hyperlocalise-web/src/lib/glossary/fixtures/fixture.json`.

Generate the seed locally without credentials:

```bash
go run ./tools/crowdin-ota-glossary-fixture --offline
```

Create a dedicated glossary, import the seed, query it, and save the recording:

```bash
export CROWDIN_PAT="..."
go run ./tools/crowdin-ota-glossary-fixture --create-glossary
```

To use an existing seeded glossary, pass its identifier. Importing into an
existing glossary is opt-in because it adds terms remotely:

```bash
go run ./tools/crowdin-ota-glossary-fixture --glossary-id 123
go run ./tools/crowdin-ota-glossary-fixture --glossary-id 123 --import
```

The recording contains the exact request body, HTTP status, and raw JSON
response for each of the 368 one-expression concordance calls. By default it is written to
`apps/hyperlocalise-web/src/lib/glossary/fixtures/ota-concordance-recording.json`
so web-app replay tests can import it directly. It does not contain credentials
or request headers.
