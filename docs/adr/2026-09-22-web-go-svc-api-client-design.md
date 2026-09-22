# Web go-svc API client

## Status

Accepted

## Context

The web app's existing go-svc clients call the same-origin `/api/go-svc`
rewrite and authenticate with the WorkOS session cookie. The AWS deployment is
available at `https://api.hyperlocalise.com` and accepts the short-lived WorkOS
session access token as a Bearer credential.

The web app needs a client for the AWS service before any production call sites
move to it.

## Decision

Add a standalone `GoSvcClient` class under
`apps/hyperlocalise-web/src/lib/go-svc/`.

The client:

- defaults to `https://api.hyperlocalise.com`;
- accepts an asynchronous access-token provider so a caller can refresh tokens;
- sends `Authorization: Bearer <token>` and never sends cookies;
- calls native `/v1` routes, not the former `/api/go-svc` rewrite;
- accepts an optional `AbortSignal`;
- exposes typed methods for all routes protected by go-svc's session
  authentication middleware;
- returns typed success data and throws a typed `GoSvcClientError` for HTTP,
  network, and malformed-response failures;
- supports JSON, empty, text, and binary responses.

The first version covers dictionaries, glossaries, translation memories, teams,
issue sheets, QA reports, activity logs, segment validation, and filtered editor
exports. It excludes Domains research, Google Search Console, object storage,
guidelines, and OFREP because those routes use service credentials or a separate
authentication contract.

No existing caller, singleton, environment variable, or AuthKit integration
will change in this work.

## Error handling

For a non-success HTTP response, the client reads the standard go-svc
`{ error, message, details }` envelope when present and throws
`GoSvcClientError` with the response status and stable error code. Network
failures use `network_error`, malformed JSON uses `invalid_response`, and an
empty token uses `missing_access_token`.

## Testing

Unit tests use an injected fetch implementation. They verify the AWS default
URL, Bearer authorization, omitted cookies, path/query encoding, JSON and empty
responses, token refresh per request, error envelopes, malformed responses,
downloads, and abort-signal forwarding.

## Deferred integration constraint

Some mutating go-svc handlers currently reject browser requests whose `Origin`
host differs from the API host. A later browser integration must add a narrow
origin allowlist and CORS policy for the web application. Server-side callers
do not send browser origin headers and are unaffected.
