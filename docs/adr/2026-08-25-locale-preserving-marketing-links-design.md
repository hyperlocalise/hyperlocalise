# Locale-preserving marketing links

## Goal

Prevent redirect chains when visitors follow internal links from localized marketing pages. A visitor on `/en`, `/fr-FR`, or another supported locale should navigate directly to the corresponding locale-prefixed route.

## Design

Keep shared marketing link definitions locale-neutral, such as `/pricing` and `/product/agents-automation`. At each marketing link-rendering boundary, rewrite localized internal paths with the active page locale by using the existing `rewriteAppLocalePath` helper.

Apply this rule to the desktop and mobile navbar, footer, legal-page home link, startups pricing call to action, product and use-case cross-links, and localized audit routes. Preserve external URLs, `mailto:` links, hash links, assets, and non-localized `/auth/*` routes.

Derive the active locale from the localized route or pass it from the route page when a Server Component already owns validated `params.lang`. Avoid hard-coded `/en` paths so language switching continues to work across every supported locale.

## Verification

- Add focused tests for locale rewriting and shared marketing navigation.
- Cover English and a non-English locale, the locale homepage, nested paths, and query or hash preservation.
- Confirm external and non-localized links remain unchanged.
- Run `vp test` and `vp check --fix` from `apps/hyperlocalise-web`.
