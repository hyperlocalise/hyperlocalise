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
- Call Resend with an idempotency key keyed by user id, then write
  `users.onboarding_email_sent_at` only after the send succeeds. A process
  crash between those steps can retry; Resend returns the same delivery.
- Set Reply-To to `minh@hyperlocalise.com`.
- Skip quietly when Resend is not configured. Fail the webhook when Resend
  is configured and the send fails, so WorkOS retries.
- Do not send on `user.updated` or membership events.
- Keep the copy transactional: create a project, add source files, install the
  CLI in GitHub Actions, and connect MCP. Link to Cloud and to
  `hyperlocalise.dev` getting-started, CI, and MCP docs.

## Consequences

WorkOS must keep `user.created` subscribed on the webhook. Local and test
environments without Resend create the user and skip the email. Existing users
do not receive a backfill.
