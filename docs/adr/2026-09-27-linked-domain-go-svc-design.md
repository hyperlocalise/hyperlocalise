# Linked-domain lifecycle in go-svc

## Status

Accepted

## Context

Linked-domain claim and management requests previously ran through the web
application's Hono API. The browser already calls go-svc directly for domain
research and Search Console, using a WorkOS access token as a Bearer token.

## Decision

Move linked-domain lifecycle HTTP handling and persistence into go-svc at
`/v1/orgs/{organizationSlug}/domains/linked-domains`. This includes listing and
reading linked domains, audit retrieval, creating claims from audit slugs or
direct domains, ownership verification, market recommendations, market and
project assignment updates, and cancelling pending claims.

Keep the existing public response shapes and organization/team visibility
rules. Enforce the workspace-domains feature flag and project read/write role
capabilities in go-svc. Verify ownership proofs against DNS TXT, a bounded
well-known file, or a homepage meta tag. Restrict outbound HTTP verification to
publicly routable addresses and bound redirects and response sizes.

Compose typed browser methods into `GoSvcDomainsApi` and update all linked-
domain UI callers to use `useGoSvcClient`. Remove the Hono route and its RPC
surface after those callers move. Keep shared linked-domain types and data
schema in the web app for the UI and other web-owned workflows.

## Consequences

Go service tests own route and persistence behavior. Web tests and stories mock
the new `/v1/orgs/{slug}/domains/linked-domains` endpoint. Local browser use
requires the existing `NEXT_PUBLIC_API_BASE_URL` and `GO_SVC_URL` configuration.
