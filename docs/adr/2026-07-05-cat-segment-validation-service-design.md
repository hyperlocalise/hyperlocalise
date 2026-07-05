# CAT segment validation service integration

## Goal

Use the Go segment-validation service as the CAT editor's source of truth for format, length, and QA checks while preserving responsive live editing.

## Architecture

The CAT client posts directly to `/api/go-svc/v1/validate/segment`. The existing Vercel rewrite routes this same-origin request to `go-svc`, and the browser's WorkOS session cookie authenticates it.

Each request includes the source text, current target text, source path, maximum length, and all supported QA modes:

- `not_localized`
- `whitespace_only`
- `same_as_source`

The client validates the response before mapping its checks to the existing `CatFormatCheck` type. The Go service owns format, length, and QA rules. Existing client-side glossary checks remain local because the Go endpoint does not accept glossary data.

## Interaction

The CAT workspace validates a newly selected segment immediately. Target edits schedule validation after a 300 ms debounce. A newer edit cancels the pending request and supersedes any in-flight response so stale checks cannot replace current results.

Validation remains advisory. A network, authentication, or response-validation failure produces one `Validation unavailable` check and does not block editing, drafts, or approval.

## Testing

Focused tests cover:

- The Go-service request payload and response mapping.
- All QA modes in the request.
- Glossary-check merging.
- Invalid and unsuccessful responses.
- Debounced edit validation and stale-request cancellation.

Run the repository's required Go and web checks before finalizing.
