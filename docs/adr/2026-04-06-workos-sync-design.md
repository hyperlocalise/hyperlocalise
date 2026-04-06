# WorkOS Sync + Webhook Design

## Context

The web app already resolves WorkOS identity during authenticated API requests, but it does not yet process WorkOS webhooks for out-of-band updates. This can leave local user, organization, and membership records stale.

## Approaches Considered

1. **Sync only on authenticated API requests (status quo)**
   - Pros: no webhook setup.
   - Cons: data drifts if identities change outside app traffic.
2. **Webhook-only sync**
   - Pros: source-of-truth event driven updates.
   - Cons: app requests fail if webhook events lag or miss.
3. **Hybrid sync (recommended)**
   - Pros: request-time sync guarantees fresh access context; webhook sync keeps local data warm and current.
   - Cons: slight duplication in sync paths.

## Chosen Design

- Extract shared DB upsert logic into a dedicated sync module (`workos-sync.ts`).
- Keep auth middleware request-time sync, but call the shared module.
- Add a new WorkOS webhook endpoint at `/api/webhooks/workos`.
- Verify webhook signatures before processing.
- Handle these events:
  - `user.created`, `user.updated`
  - `organization.created`, `organization.updated`
  - `organization_membership.created`, `organization_membership.updated`, `organization_membership.deleted`
- Add WorkOS environment variables for API + Next.js integration surface.
- Add WorkOS dependency declarations for API and Next.js support.

## Error Handling

- Invalid webhook signature returns `401`.
- Malformed webhook payload returns `400`.
- Missing optional fields for specific events are treated as no-op for safety.

## Testing Plan

- Add route tests for invalid signature handling and a successful `user.created` webhook sync path.

