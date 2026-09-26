# AI Gateway embedding client

Status: approved for implementation.

## Decision

Add `internal/embedding` as a Go client that calls Vercel AI Gateway
`POST /v1/embeddings` with `google/gemini-embedding-2`. go-svc can import it
later. This change does not index into turbopuffer, extract text, or ingest
knowledge files.

The model ID and output size are package constants. They are a vector-space
contract, not configuration. Callers pass only connection details (API key,
base URL, optional HTTP client and byte limit). The client does not read
environment variables.

| Constant | Value |
| --- | --- |
| Model | `google/gemini-embedding-2` |
| Dimensions | 1536 |

1536 is one of Google’s recommended Matryoshka sizes. It is cheaper to store
than the native 3072 while remaining a documented quality point. Changing
either constant requires a new turbopuffer deployment prefix.

## API

`EmbedQuery` prefixes text with Gemini Embedding 2’s retrieval query form
(`task: search result | query: …`). `EmbedDocument` prefixes text with
`title: … | text: …` (title `none` when omitted). File-only documents send no
task prefix.

Accepted document bytes: PNG, JPEG, and PDF. The client sends those through
`providerOptions.google.content` as `inlineData`. One file per call. DOCX and
other Office formats are rejected; they are not native modalities for this
model. PDF page limits (six pages) are enforced by the provider, not by this
package.

The result is a `[]float32` of length `Dimensions`. A response of any other
length is an error so an incompatible vector cannot be written to an index.

## Out of scope

Turbopuffer upsert and search, go-svc HTTP routes, knowledge upload, replacing
`internal/textextract`, and page-splitting long PDFs.

## Validation

httptest covers request JSON (model, dimensions, query/document prefixes,
multimodal `providerOptions`), validation errors, and vector length. Run
`make fmt`, `make lint`, and `make test`.
