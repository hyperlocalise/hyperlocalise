# CAT segment validation service integration

## Goal

Use the Go segment-validation service as the CAT editor's source of truth for format, length, and QA checks while preserving responsive live editing.

## Architecture

The CAT client posts to `/api/go-svc/v1/validate/segment`. Next.js
proxies that path to go-svc over the Vercel service binding
(`GO_SVC_URL`). go-svc is not on the public rewrite table; only `web`
is. The proxy forwards the WorkOS session cookie, and go-svc still
authenticates the call. Local development uses `http://127.0.0.1:8080`
when `GO_SVC_URL` is unset.

Each request includes the source text, current target text, source path, and all supported QA modes. It includes `maxLength` only when the segment defines a positive limit.

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
