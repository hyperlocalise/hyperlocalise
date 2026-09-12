# Onboarding welcome email

## Date

2026-09-12

## Status

Accepted

## Context

New Hyperlocalise users get an in-app workspace wizard after sign-in, but nothing
lands in their inbox. A short getting-started note should arrive when they first
register, with the same shape as a product welcome: who we are, three concrete
next steps, and how to connect an agent over MCP.

WorkOS already delivers `user.created` to `POST /api/webhooks/workos`. That event
is the registration signal. The app already sends transactional mail through
Resend.

## Decision

Send one welcome email from the existing WorkOS webhook on `user.created` only.

- Sync the local user first, then send.
- Claim `users.onboarding_email_sent_at` before calling Resend so webhook retries
  and concurrent deliveries cannot send twice.
- Use a Resend idempotency key keyed by user id as a second guard.
- Skip quietly when Resend is not configured. Release the claim and fail the
  webhook when Resend is configured and the send fails, so WorkOS retries.
- Do not send on `user.updated` or membership events.
- Keep the copy transactional: create a project, add source files, connect MCP.
  Link to Cloud and to `hyperlocalise.dev` getting-started and MCP docs.

## Consequences

WorkOS must keep `user.created` subscribed on the webhook. Local and test
environments without Resend create the user and skip the email. Existing users
do not receive a backfill.
