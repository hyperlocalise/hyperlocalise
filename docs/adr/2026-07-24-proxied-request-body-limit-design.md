# Proxied request body limit

## Context

The conversation creation route accepts multipart uploads and limits request bodies to 25 MB.
Hono's `bodyLimit` middleware buffers requests without a trustworthy `Content-Length` header,
then rebuilds them with `new Request(c.req.raw, init)`.

Next.js can pass a proxy around Node's Undici `Request` in production. Undici cannot read its
private state through that proxy, so rebuilding the request throws before the route handler runs.

## Design

Replace Hono's middleware on this route with a local middleware that keeps the same limit and
response contract. Trust `Content-Length` only when `Transfer-Encoding` is absent. Otherwise,
read the stream, reject it once it exceeds 25 MB, and replay accepted bytes in a new request.

Build the replay request from the original URL and explicit request fields. Do not pass the
proxied request to the `Request` constructor.

Keep the change route-local. Other endpoints do not need this compatibility layer until they
accept streamed bodies through the same middleware.

## Verification

Add a regression test that passes a proxied multipart request without `Content-Length` through
the production app. Assert that conversation creation succeeds and preserves the initial message.
Keep the existing oversized-upload behavior covered by the route test suite.
