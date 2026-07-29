# App locale support and selector

## Decision

Promote ready content locales into `SUPPORTED_APP_LOCALES` and add a
`LocaleToggle` beside `ThemeToggle` on marketing and in the app shell.

## Supported locales

Set `SUPPORTED_APP_LOCALES` to match `AVAILABLE_APP_CONTENT_LOCALES`:

`en`, `zh-CN`, `vi-VN`, `de-DE`, `fr-FR`

Routing, cookie negotiation (`hl_locale`), sitemap, robots, and Storybook
toolbar all derive from this list. Message catalogs for these locales already
exist under `apps/hyperlocalise-web/lang/`.

## Locale toggle

Add `LocaleToggle` under `src/components/locale-toggle/`, shaped like
`ThemeToggle` (icon button, dropdown radio list, tooltip, a11y messages).

- Options: `SUPPORTED_APP_LOCALES`
- Labels: each locale’s native display name
- Placement: next to `ThemeToggle` in the marketing navbar and app shell header

## Switch behavior

On select:

1. Rewrite the current path’s `/[lang]` prefix to the chosen locale (prefix if
   missing; preserve query and hash).
2. Navigate with the App Router.
3. Let the existing proxy set `X-Locale` and the `hl_locale` cookie on the
   localized response.

Same-locale selection is a no-op. The switcher only offers supported locales,
so it cannot invent invalid tags.

## Out of scope

- Filling remaining untranslated UI strings beyond existing catalogs
- Changing project translation `COMMON_LOCALES` or project locale pickers

## Verification

- Update `locales.test.ts` for the expanded supported set and Accept-Language /
  cookie negotiation.
- Unit-test the path rewrite helper.
- Run `vp test` and `vp check --fix` from `apps/hyperlocalise-web`.
