# Route error recovery

## Context

Unexpected App Router failures currently fall through to Next.js defaults. Users lose product context, navigation, and a clear recovery path.

## Design

Add three boundaries with progressively broader coverage:

- The organization boundary handles failures below the organization layout and keeps the application shell available.
- The locale boundary handles failures in localized marketing and authenticated routes, including failures that prevent the organization shell from rendering.
- The global boundary handles failures in the root layout and remains self-contained because application providers may be unavailable.

The locale and organization boundaries use the active message catalog. Each boundary offers a retry, a dashboard route, and the existing support email address. A shared presentation component keeps the recovery experience consistent without coupling it to route state or localization providers.

### Retry

Next.js 16.2+ supplies both `reset` and `unstable_retry` to `error.js` / `global-error.js`. Boundaries call `unstable_retry`, which re-fetches and re-renders the failed segment. Prefer it over `reset`, which only clears client error state and does not recover Server Component failures.

### Dashboard fallbacks

Dashboard destinations differ by how much route context remains available:

- Organization boundary: `/${lang}/org/${organizationSlug}/dashboard`
- Locale boundary: `/${lang}/dashboard`, which resolves the active organization through the authenticated dashboard route
- Global boundary: `/dashboard`, which the locale proxy rewrites to `/${locale}/dashboard`, then the same authenticated dashboard route

These resolver paths are intentional. Locale and global boundaries do not have a reliable organization slug, so they must not hard-code an org-scoped URL.

## Verification

Cover the shared recovery actions and boundary-specific routes with focused component tests. Run the web app's formatting, lint, and type checks.
