# Localisation audit sign-in CTA feature flag

## Date

2026-08-15

## Context

The public localisation audit result page shows sign-in CTAs (claim domain,
create workspace / deeper audit). We want a controlled rollout: only
authenticated users who are allowlisted in WorkOS Feature Flags should see
those buttons. Guests and other signed-in users should not.

Claim routes and linked-domain APIs stay reachable by URL; this change only
hides the marketing CTAs.

## Decision

Gate the sign-in CTAs **client-side** with AuthKit session feature flags.

1. WorkOS flag key: `localisation-audit-sign-in-ctas`.
2. Target specific users in the WorkOS dashboard so the key appears in the
   session `feature_flags` claim.
3. In `LocalisationAuditResult`, use `useAuth()`:
   - hide while auth is loading
   - hide when there is no user
   - show only when `featureFlags` includes the flag key
4. Gated buttons: claim domain / open in workspace, create workspace / deeper
   audit. Keep re-run and book demo.
5. Workspace embed (`variant="workspace"`) already omits this CTA block.

## Consequences

- Flag changes apply after the next session refresh (access-token claim).
- CTAs may briefly stay hidden while AuthKit loads; that avoids a guest flash.
- Direct navigation to `/claim-domain/...` is not blocked by this flag.
